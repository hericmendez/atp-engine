import { describe, it, expect } from 'vitest';
import { TokenBucketRateLimiter } from '../../src/infrastructure/rate-limiter.js';

function fakeClock() {
  let t = 0;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    slept,
    time: () => t,
  };
}

describe('TokenBucketRateLimiter', () => {
  it('rejects non-positive rates', () => {
    expect(() => new TokenBucketRateLimiter(0)).toThrow('must be positive');
    expect(() => new TokenBucketRateLimiter(-2)).toThrow('must be positive');
    expect(() => new TokenBucketRateLimiter(Number.NaN)).toThrow('must be positive');
  });

  it('grants the first token immediately', async () => {
    const clock = fakeClock();
    const limiter = new TokenBucketRateLimiter(4, clock);

    await limiter.acquire();

    expect(limiter.acquired).toBe(1);
    expect(clock.slept).toEqual([]);
  });

  it('spaces sequential acquisitions at the configured rate (no burst)', async () => {
    const clock = fakeClock();
    const limiter = new TokenBucketRateLimiter(2, clock);
    const doneAt: number[] = [];

    for (let i = 0; i < 4; i += 1) {
      await limiter.acquire();
      doneAt.push(clock.time());
    }

    expect(limiter.acquired).toBe(4);
    expect(doneAt).toEqual([0, 500, 1000, 1500]);
  });

  it('stays consistent under concurrency (shared stream, no deadlock)', async () => {
    const clock = fakeClock();
    const limiter = new TokenBucketRateLimiter(2, clock);

    // Concurrency 5 against a 2/s limit: every acquisition still
    // passes through the single token stream — 6 grants need the
    // equivalent of >= 2.5s of paced virtual time, never a burst.
    await Promise.all(Array.from({ length: 6 }, () => limiter.acquire()));

    expect(limiter.acquired).toBe(6);
    expect(clock.time()).toBeGreaterThanOrEqual(2500);
  });

  it('keeps working after consumer errors (queue never wedges)', async () => {
    const clock = fakeClock();
    const limiter = new TokenBucketRateLimiter(10, clock);

    await limiter.acquire();
    try {
      await limiter.acquire();
      throw new Error('consumer boom');
    } catch {
      // consumer-side failure, limiter untouched
    }
    await limiter.acquire();

    expect(limiter.acquired).toBe(3);
  });

  it('counts every granted acquisition for telemetry', async () => {
    const clock = fakeClock();
    const limiter = new TokenBucketRateLimiter(100, clock);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(limiter.acquired).toBe(3);
  });
});
