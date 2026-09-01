import type { CatalogSyncService } from '../application/catalog-sync-service.js';
import type { SyncResult } from '../application/catalog-sync-types.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface CatalogSyncScheduler {
  start(): void;
  stop(): Promise<void>;
  getStatus(): CatalogSyncSchedulerStatus;
  runNow(): Promise<SyncResult>;
}

export interface CatalogSyncSchedulerStatus {
  readonly running: boolean;
  readonly lastRunAt: Date | null;
  readonly lastRunResult: SyncResult | null;
  readonly runCount: number;
  readonly intervalMs: number;
  readonly lookbackDays: number;
  readonly enabled: boolean;
}

export interface CatalogSyncSchedulerConfig {
  readonly intervalMs: number;
  readonly lookbackDays: number;
  readonly enabled: boolean;
}

export interface CatalogSyncSchedulerDependencies {
  readonly catalogSyncService: CatalogSyncService;
}

export class IntervalCatalogSyncScheduler implements CatalogSyncScheduler {
  private readonly catalogSyncService: CatalogSyncService;
  private readonly intervalMs: number;
  private readonly lookbackDays: number;
  private readonly enabled: boolean;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastRunAt: Date | null = null;
  private lastRunResult: SyncResult | null = null;
  private runCount = 0;

  constructor(deps: CatalogSyncSchedulerDependencies, config: CatalogSyncSchedulerConfig) {
    if (config.intervalMs <= 0) {
      throw new Error('CatalogSyncScheduler: intervalMs must be positive');
    }
    if (config.lookbackDays <= 0) {
      throw new Error('CatalogSyncScheduler: lookbackDays must be positive');
    }

    this.catalogSyncService = deps.catalogSyncService;
    this.intervalMs = config.intervalMs;
    this.lookbackDays = config.lookbackDays;
    this.enabled = config.enabled;
  }

  start(): void {
    if (!this.enabled) {
      logger.info('CatalogSyncScheduler: disabled, not starting');
      return;
    }

    if (this.intervalHandle !== null) {
      logger.warn('CatalogSyncScheduler: already started');
      return;
    }

    logger.info('CatalogSyncScheduler: starting', {
      intervalMs: this.intervalMs,
      lookbackDays: this.lookbackDays,
    });

    this.intervalHandle = setInterval(() => {
      void this.executeRun();
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.intervalHandle === null) {
      return;
    }

    logger.info('CatalogSyncScheduler: stopping');

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;

    if (this.running) {
      logger.info('CatalogSyncScheduler: waiting for active run to complete');
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

    logger.info('CatalogSyncScheduler: stopped');
  }

  getStatus(): CatalogSyncSchedulerStatus {
    return {
      running: this.running,
      lastRunAt: this.lastRunAt,
      lastRunResult: this.lastRunResult,
      runCount: this.runCount,
      intervalMs: this.intervalMs,
      lookbackDays: this.lookbackDays,
      enabled: this.enabled,
    };
  }

  async runNow(): Promise<SyncResult> {
    return this.executeRun();
  }

  private async executeRun(): Promise<SyncResult> {
    if (this.running) {
      logger.info('CatalogSyncScheduler: run already in progress, skipping');
      return {
        status: 'failed',
        platforms: [],
        totals: {
          candidatesFound: 0,
          newGames: 0,
          existingGames: 0,
          updatedGames: 0,
          rejected: 0,
          errors: 0,
        },
        dryRun: false,
        durationMs: 0,
      };
    }

    this.running = true;
    const startTime = Date.now();

    logger.info('CatalogSyncScheduler: sync started');

    try {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - this.lookbackDays);

      const fromStr = from.toISOString().split('T')[0];
      const toStr = now.toISOString().split('T')[0];

      const result = await this.catalogSyncService.sync({
        activeOnly: true,
        from: fromStr,
        to: toStr,
        dryRun: false,
      });

      this.lastRunAt = new Date();
      this.lastRunResult = result;
      this.runCount++;

      logger.info('CatalogSyncScheduler: sync completed', {
        status: result.status,
        platformCount: result.platforms.length,
        totalCandidates: result.totals.candidatesFound,
        totalNew: result.totals.newGames,
        totalUpdated: result.totals.updatedGames,
        totalRejected: result.totals.rejected,
        totalErrors: result.totals.errors,
        durationMs: result.durationMs,
        wallClockMs: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const errorResult: SyncResult = {
        status: 'failed',
        platforms: [],
        totals: {
          candidatesFound: 0,
          newGames: 0,
          existingGames: 0,
          updatedGames: 0,
          rejected: 0,
          errors: 1,
        },
        dryRun: false,
        durationMs: Date.now() - startTime,
      };

      this.lastRunAt = new Date();
      this.lastRunResult = errorResult;
      this.runCount++;

      logger.error('CatalogSyncScheduler: sync failed', {
        error: error instanceof Error ? error.message : String(error),
        durationMs: errorResult.durationMs,
      });

      return errorResult;
    } finally {
      this.running = false;
    }
  }
}
