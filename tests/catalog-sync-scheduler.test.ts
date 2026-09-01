import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  IntervalCatalogSyncScheduler,
  type CatalogSyncSchedulerDependencies,
  type CatalogSyncSchedulerConfig,
} from '../src/infrastructure/catalog-sync-scheduler.js';
import type { CatalogSyncService } from '../src/application/catalog-sync-service.js';
import type { SyncResult } from '../src/application/catalog-sync-types.js';

function createMockCatalogSyncService(): CatalogSyncService {
  return {
    sync: vi.fn(async (): Promise<SyncResult> => ({
      status: 'completed',
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
      durationMs: 100,
    })),
  } as unknown as CatalogSyncService;
}

function createDefaultConfig(
  overrides: Partial<CatalogSyncSchedulerConfig> = {},
): CatalogSyncSchedulerConfig {
  return {
    intervalMs: overrides.intervalMs ?? 60_000,
    lookbackDays: overrides.lookbackDays ?? 30,
    enabled: overrides.enabled ?? true,
  };
}

function createSyncResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    status: overrides.status ?? 'completed',
    platforms: overrides.platforms ?? [],
    totals: overrides.totals ?? {
      candidatesFound: 0,
      newGames: 0,
      existingGames: 0,
      updatedGames: 0,
      rejected: 0,
      errors: 0,
    },
    dryRun: overrides.dryRun ?? false,
    durationMs: overrides.durationMs ?? 100,
  };
}

describe('IntervalCatalogSyncScheduler', () => {
  let mockCatalogSyncService: CatalogSyncService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockCatalogSyncService = createMockCatalogSyncService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createScheduler(
    deps: Partial<CatalogSyncSchedulerDependencies> = {},
    config: Partial<CatalogSyncSchedulerConfig> = {},
  ): IntervalCatalogSyncScheduler {
    return new IntervalCatalogSyncScheduler(
      {
        catalogSyncService: deps.catalogSyncService ?? mockCatalogSyncService,
      },
      createDefaultConfig(config),
    );
  }

  describe('lifecycle', () => {
    it('starts correctly when enabled', () => {
      const scheduler = createScheduler();
      scheduler.start();
      expect(scheduler.getStatus().enabled).toBe(true);
    });

    it('does not start when disabled', () => {
      const scheduler = createScheduler({}, { enabled: false });
      scheduler.start();
      expect(scheduler.getStatus().running).toBe(false);
    });

    it('stops correctly', async () => {
      const scheduler = createScheduler();
      scheduler.start();
      await scheduler.stop();
      expect(scheduler.getStatus().running).toBe(false);
    });

    it('does nothing on stop when not started', async () => {
      const scheduler = createScheduler();
      await scheduler.stop();
      expect(scheduler.getStatus().running).toBe(false);
    });

    it('does not start twice', () => {
      const scheduler = createScheduler();
      scheduler.start();
      scheduler.start();
      expect(scheduler.getStatus().enabled).toBe(true);
    });

    it('can be started and stopped repeatedly', async () => {
      const scheduler = createScheduler();
      scheduler.start();
      await scheduler.stop();
      scheduler.start();
      await scheduler.stop();
      expect(scheduler.getStatus().running).toBe(false);
    });
  });

  describe('scheduled execution', () => {
    it('invokes sync at the configured interval', async () => {
      const scheduler = createScheduler({}, { intervalMs: 5000 });
      scheduler.start();

      expect(mockCatalogSyncService.sync).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockCatalogSyncService.sync).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5000);
      expect(mockCatalogSyncService.sync).toHaveBeenCalledTimes(2);

      await scheduler.stop();
    });

    it('uses correct lookback window in from/to dates', async () => {
      const scheduler = createScheduler({}, { intervalMs: 1000, lookbackDays: 7 });
      scheduler.start();

      const fixedDate = new Date('2026-03-15T12:00:00Z');
      vi.setSystemTime(fixedDate);

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockCatalogSyncService.sync).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2026-03-08',
          to: '2026-03-15',
          activeOnly: true,
          dryRun: false,
          trigger: 'scheduled',
        }),
      );

      await scheduler.stop();
    });

    it('uses configurable lookback days', async () => {
      const scheduler = createScheduler({}, { intervalMs: 1000, lookbackDays: 90 });
      scheduler.start();

      const fixedDate = new Date('2026-06-01T00:00:00Z');
      vi.setSystemTime(fixedDate);

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockCatalogSyncService.sync).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2026-03-03',
          to: '2026-06-01',
        }),
      );

      await scheduler.stop();
    });

    it('records run count and last run time', async () => {
      const scheduler = createScheduler({}, { intervalMs: 1000 });
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);

      const status = scheduler.getStatus();
      expect(status.runCount).toBe(1);
      expect(status.lastRunAt).toBeInstanceOf(Date);
      expect(status.lastRunResult).toBeDefined();

      await scheduler.stop();
    });
  });

  describe('concurrency guard', () => {
    it('does not overlap when runNow is called during scheduled run', async () => {
      let syncCallCount = 0;
      let resolveFirstSync: (() => void) | null = null;
      vi.mocked(mockCatalogSyncService.sync).mockImplementation(async () => {
        syncCallCount++;
        if (syncCallCount === 1) {
          await new Promise<void>((resolve) => {
            resolveFirstSync = resolve;
          });
        }
        return createSyncResult({ status: 'completed' });
      });

      const scheduler = createScheduler({}, { intervalMs: 1000 });
      scheduler.start();

      // Start first run via runNow — this keeps running=true
      const firstRunPromise = scheduler.runNow();

      // While first run is in progress, trigger interval tick
      await vi.advanceTimersByTimeAsync(1000);

      // The interval should have been skipped (running=true)
      expect(scheduler.getStatus().running).toBe(true);

      // Complete the first run
      resolveFirstSync?.();
      await firstRunPromise;

      // Now the scheduler is free
      expect(scheduler.getStatus().running).toBe(false);
      expect(scheduler.getStatus().runCount).toBe(1);

      await scheduler.stop();
    });

    it('runNow returns failed when already running', async () => {
      let resolveFirstSync: (() => void) | null = null;
      vi.mocked(mockCatalogSyncService.sync).mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolveFirstSync = resolve;
        });
        return createSyncResult();
      });

      const scheduler = createScheduler({}, { intervalMs: 1000 });
      scheduler.start();

      // Start first run via runNow
      const firstRunPromise = scheduler.runNow();

      // Call runNow again while first is still running
      const result = await scheduler.runNow();
      expect(result.status).toBe('failed');

      // Complete the first run
      resolveFirstSync?.();
      await firstRunPromise;

      expect(scheduler.getStatus().runCount).toBe(1);
      await scheduler.stop();
    });
  });

  describe('error handling', () => {
    it('recovers after synchronization failure', async () => {
      vi.mocked(mockCatalogSyncService.sync)
        .mockRejectedValueOnce(new Error('Source unavailable'))
        .mockResolvedValueOnce(createSyncResult({ status: 'completed' }));

      const scheduler = createScheduler({}, { intervalMs: 1000 });
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(scheduler.getStatus().lastRunResult?.status).toBe('failed');
      expect(scheduler.getStatus().runCount).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(scheduler.getStatus().lastRunResult?.status).toBe('completed');
      expect(scheduler.getStatus().runCount).toBe(2);

      await scheduler.stop();
    });

    it('handles partial platform failures', async () => {
      vi.mocked(mockCatalogSyncService.sync).mockResolvedValue(
        createSyncResult({
          status: 'partial',
          platforms: [
            {
              platformId: 'nintendo-switch',
              platformName: 'Nintendo Switch',
              candidatesFound: 5,
              newGames: 3,
              existingGames: 1,
              updatedGames: 0,
              rejected: 1,
              errors: 0,
              status: 'completed',
            },
            {
              platformId: 'ps5',
              platformName: 'PlayStation 5',
              candidatesFound: 0,
              newGames: 0,
              existingGames: 0,
              updatedGames: 0,
              rejected: 0,
              errors: 1,
              status: 'failed',
              error: 'Source timeout',
            },
          ],
        }),
      );

      const scheduler = createScheduler({}, { intervalMs: 1000 });
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);

      const result = scheduler.getStatus().lastRunResult;
      expect(result?.status).toBe('partial');
      expect(result?.platforms).toHaveLength(2);

      await scheduler.stop();
    });

    it('handles complete synchronization failure', async () => {
      vi.mocked(mockCatalogSyncService.sync).mockRejectedValue(new Error('Database unavailable'));

      const scheduler = createScheduler({}, { intervalMs: 1000 });
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);

      const result = scheduler.getStatus().lastRunResult;
      expect(result?.status).toBe('failed');
      expect(result?.totals.errors).toBe(1);

      await scheduler.stop();
    });
  });

  describe('runNow()', () => {
    it('executes immediately and returns result', async () => {
      vi.mocked(mockCatalogSyncService.sync).mockResolvedValue(
        createSyncResult({
          status: 'completed',
          totals: {
            candidatesFound: 10,
            newGames: 5,
            existingGames: 3,
            updatedGames: 1,
            rejected: 1,
            errors: 0,
          },
        }),
      );

      const scheduler = createScheduler();
      const result = await scheduler.runNow();

      expect(result.status).toBe('completed');
      expect(result.totals.newGames).toBe(5);
      expect(mockCatalogSyncService.sync).toHaveBeenCalledTimes(1);
    });

    it('updates status after manual run', async () => {
      const scheduler = createScheduler();
      await scheduler.runNow();

      const status = scheduler.getStatus();
      expect(status.runCount).toBe(1);
      expect(status.lastRunAt).toBeInstanceOf(Date);
      expect(status.lastRunResult).toBeDefined();
    });
  });

  describe('status', () => {
    it('returns initial status before any runs', () => {
      const scheduler = createScheduler({}, { intervalMs: 5000, lookbackDays: 14 });
      const status = scheduler.getStatus();

      expect(status.running).toBe(false);
      expect(status.lastRunAt).toBeNull();
      expect(status.lastRunResult).toBeNull();
      expect(status.runCount).toBe(0);
      expect(status.intervalMs).toBe(5000);
      expect(status.lookbackDays).toBe(14);
      expect(status.enabled).toBe(true);
    });

    it('tracks multiple runs', async () => {
      const scheduler = createScheduler({}, { intervalMs: 1000 });
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      expect(scheduler.getStatus().runCount).toBe(3);

      await scheduler.stop();
    });
  });

  describe('empty active platforms', () => {
    it('completes successfully with zero platforms', async () => {
      vi.mocked(mockCatalogSyncService.sync).mockResolvedValue(
        createSyncResult({
          status: 'completed',
          platforms: [],
        }),
      );

      const scheduler = createScheduler({}, { intervalMs: 1000 });
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);

      const result = scheduler.getStatus().lastRunResult;
      expect(result?.status).toBe('completed');
      expect(result?.platforms).toHaveLength(0);

      await scheduler.stop();
    });
  });
});

describe('CatalogSyncScheduler configuration', () => {
  it('accepts valid config values', () => {
    const scheduler = new IntervalCatalogSyncScheduler(
      {
        catalogSyncService: createMockCatalogSyncService(),
      },
      { intervalMs: 3_600_000, lookbackDays: 7, enabled: true },
    );
    const status = scheduler.getStatus();
    expect(status.intervalMs).toBe(3_600_000);
    expect(status.lookbackDays).toBe(7);
    expect(status.enabled).toBe(true);
  });

  it('rejects zero interval', () => {
    expect(
      () =>
        new IntervalCatalogSyncScheduler(
          {
            catalogSyncService: createMockCatalogSyncService(),
          },
          { intervalMs: 0, lookbackDays: 30, enabled: true },
        ),
    ).toThrow();
  });

  it('rejects zero lookback days', () => {
    expect(
      () =>
        new IntervalCatalogSyncScheduler(
          {
            catalogSyncService: createMockCatalogSyncService(),
          },
          { intervalMs: 60_000, lookbackDays: 0, enabled: true },
        ),
    ).toThrow();
  });
});
