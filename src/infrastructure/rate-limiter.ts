/**
 * Explicit token-bucket rate limiter for provider calls.
 *
 * Separates "requests per second" from "concurrency": N concurrent
 * workers still share one token stream. Capacity is exactly 1 token,
 * so bursts are impossible by design — sustained rate converges to
 * `requestsPerSecond` with perfectly smooth spacing (1/rps between
 * acquisitions). The clock is injectable for deterministic tests
 * (no real sleeps, no flaky Date.now() assertions).
 */

export interface RateLimiterClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const realClock: RateLimiterClock = { now: () => Date.now(), sleep: realSleep };

export class TokenBucketRateLimiter {
  private tokens = 1;
  private last: number;
  /** Total acquire() calls granted (== provider requests gated). */
  acquired = 0;

  constructor(
    private readonly requestsPerSecond: number,
    private readonly clock: RateLimiterClock = realClock,
  ) {
    if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
      throw new Error(
        `TokenBucketRateLimiter: requestsPerSecond must be positive (got ${requestsPerSecond})`,
      );
    }
    this.last = clock.now();
  }

  get rate(): number {
    return this.requestsPerSecond;
  }

  async acquire(): Promise<void> {
    for (;;) {
      const now = this.clock.now();
      const refilled = ((now - this.last) / 1000) * this.requestsPerSecond;
      this.tokens = Math.min(1, Math.max(0, this.tokens + refilled));
      this.last = now;
      if (this.tokens >= 1) {
        this.tokens -= 1;
        this.acquired += 1;
        return;
      }
      const deficitMs = Math.ceil(((1 - this.tokens) / this.requestsPerSecond) * 1000);
      await this.clock.sleep(deficitMs);
    }
  }
}
