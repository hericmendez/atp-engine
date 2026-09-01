import type { EnrichmentRunner, EnrichmentRunResult } from '../application/enrichment-runner.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface EnrichmentScheduler {
  start(): void;
  stop(): Promise<void>;
  getStatus(): SchedulerStatus;
}

export interface SchedulerStatus {
  readonly running: boolean;
  readonly lastRunAt: Date | null;
  readonly lastRunResult: EnrichmentRunResult | null;
  readonly runCount: number;
  readonly intervalMs: number;
}

export interface IntervalEnrichmentSchedulerConfig {
  readonly intervalMs: number;
}

export class IntervalEnrichmentScheduler implements EnrichmentScheduler {
  private readonly runner: EnrichmentRunner;
  private readonly intervalMs: number;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastRunAt: Date | null = null;
  private lastRunResult: EnrichmentRunResult | null = null;
  private runCount = 0;

  constructor(runner: EnrichmentRunner, config: IntervalEnrichmentSchedulerConfig) {
    this.runner = runner;
    this.intervalMs = config.intervalMs;
  }

  start(): void {
    if (this.intervalHandle !== null) {
      logger.warn('EnrichmentScheduler: already started');
      return;
    }

    logger.info('EnrichmentScheduler: starting', {
      intervalMs: this.intervalMs,
    });

    this.intervalHandle = setInterval(() => {
      void this.executeRun();
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.intervalHandle === null) {
      return;
    }

    logger.info('EnrichmentScheduler: stopping');

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;

    if (this.running) {
      logger.info('EnrichmentScheduler: waiting for active run to complete');
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (!this.running) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

    logger.info('EnrichmentScheduler: stopped');
  }

  getStatus(): SchedulerStatus {
    return {
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastRunResult: this.lastRunResult,
      runCount: this.runCount,
      intervalMs: this.intervalMs,
    };
  }

  private async executeRun(): Promise<void> {
    if (this.running) {
      logger.debug('EnrichmentScheduler: run already in progress, skipping');
      return;
    }

    this.running = true;

    try {
      const result = await this.runner.runOnce();
      this.lastRunAt = new Date();
      this.lastRunResult = result;
      this.runCount++;
    } catch (error) {
      logger.error('EnrichmentScheduler: run failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.running = false;
    }
  }
}
