import type { GameRepository } from '../domain/game/game-repository.js';
import type { CoverService } from './cover-service.js';
import { logger } from '../infrastructure/logger/logger.js';
import {
  COVER_ENRICHMENT_CHECKPOINT_KEY,
  type CoverCheckpointStatus,
} from './cover-enrichment-checkpoint-types.js';
import type { CoverCheckpointRepository } from './cover-enrichment-checkpoint-repository.js';
import type { EnrichmentJobRepository } from '../domain/enrichment-job/enrichment-job-repository.js';
import type { EnrichmentJob } from '../domain/enrichment-job/enrichment-job.js';
import { resolveLeaseConfig } from '../domain/enrichment-job/lease-config.js';

export interface CoverMassRunResult {
  readonly status: Extract<CoverCheckpointStatus, 'COMPLETED' | 'RUNNING'> | 'PAUSED' | 'FAILED';
  readonly processed: number;
  readonly found: number;
  readonly persisted: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly batches: number;
  readonly cursor: string;
  readonly dryRun: boolean;
  readonly durationMs: number;
  readonly jobId?: string;
  readonly totalEstimate?: number | null;
}

export interface CoverEnrichmentRunnerOptions {
  readonly batchSize: number;
  readonly limit?: number;
  readonly dryRun?: boolean;
  readonly restart?: boolean;
  readonly delayMs?: number;
  /** When using EnrichmentJob persistence, resume this specific job */
  readonly jobId?: string;
  /** Lease ownership — Phase 2 */
  readonly ownerId?: string;
  readonly leaseDurationMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly gracefulShutdownTimeoutMs?: number;
}

export class CoverEnrichmentRunner {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly coverService: CoverService,
    private readonly jobRepository?: EnrichmentJobRepository,
  ) {}

  /**
   * Deterministic cover sweep over cover:null games.
   * Each batch re-queries `needsCover && domainId > cursor` ASC, so already-covered
   * games leave the set and can never cause skips. Checkpoint is own key/mode,
   * never the companies one. Per-game provider errors are isolated (failed++),
   * batch still advances. Limit stops stay RUNNING, exhaustion => COMPLETED.
   *
   * Phase 1: when EnrichmentJobRepository is injected, EnrichmentJob.cursor
   * is the authoritative committed horizon. Counters are accumulated.
   * Legacy CoverCheckpoint path is preserved with accumulated-counter fix.
   *
   * Commit semantics:
   *   process batch (Game updates)
   *     ↓
   *   persist Job cursor+counters (or checkpoint)
   *     ↓
   *   batch considered committed. Never advance cursor beyond confirmed persist.
   */
  async runMass(
    checkpoints: CoverCheckpointRepository | undefined,
    options: CoverEnrichmentRunnerOptions,
  ): Promise<CoverMassRunResult> {
    // Prefer job-based persistence when repository is available (Phase 1 authority)
    if (this.jobRepository) {
      return this.runWithJob(options, checkpoints);
    }
    return this.runWithCheckpoint(checkpoints, options);
  }

  // ── Job-based path (authoritative, Phase 2 lease) ────────────

  private generateOwnerId(): string {
    const rand = Math.random().toString(36).slice(2, 6);
    return `runner:${process.pid}:${rand}`;
  }

  private async runWithJob(
    options: CoverEnrichmentRunnerOptions,
    fallbackCheckpoints?: CoverCheckpointRepository,
  ): Promise<CoverMassRunResult> {
    const start = Date.now();
    const dryRun = options.dryRun ?? false;
    const delayMs = options.delayMs ?? 0;
    const limit = options.limit;
    if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
      throw new Error(`runMass: batchSize must be positive (got ${options.batchSize})`);
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error(`runMass: limit must be positive (got ${limit})`);
    }
    const leaseCfg = resolveLeaseConfig({
      leaseDurationMs: options.leaseDurationMs,
      heartbeatIntervalMs: options.heartbeatIntervalMs,
    });
    const repo = this.jobRepository!;

    // Dry-run never creates/persists jobs (spec H). Run pure selection preview.
    if (dryRun) {
      let cursor = '';
      let processed = 0;
      let found = 0;
      let unchanged = 0;
      let batches = 0;
      let exhausted = false;
      for (;;) {
        if (limit !== undefined && processed >= limit) break;
        const fetchSize =
          limit === undefined ? options.batchSize : Math.min(options.batchSize, limit - processed);
        const page = await this.gameRepository.findMany({
          needsCover: true,
          afterDomainId: cursor === '' ? undefined : cursor,
          sort: { field: 'domainId', direction: 'asc' },
          limit: fetchSize,
        });
        if (page.items.length === 0) {
          exhausted = true;
          break;
        }
        for (const game of page.items) {
          processed += 1;
          found += 1;
          unchanged += 1;
          cursor = game.id;
          if (limit !== undefined && processed >= limit) break;
        }
        batches += 1;
        if (limit !== undefined && processed >= limit) break;
      }
      const status = exhausted ? 'COMPLETED' : 'RUNNING';
      return {
        status,
        processed,
        found,
        persisted: 0,
        unchanged,
        failed: 0,
        batches,
        cursor,
        dryRun: true,
        durationMs: Date.now() - start,
        totalEstimate: null,
      };
    }

    // Resolve or create job
    let job: EnrichmentJob | null = null;
    let isNewJob = false;

    if (options.jobId) {
      job = await repo.findById(options.jobId);
      if (!job) throw new Error(`EnrichmentJob ${options.jobId} not found`);
      if (job.type !== 'cover') throw new Error(`Job ${job.id} type ${job.type} is not cover`);
    } else if (options.restart) {
      const totalEstimate = await this.estimateTotal();
      job = await repo.create({
        type: 'cover',
        mode: 'needs-cover',
        batchSize: options.batchSize,
        totalEstimate,
      });
      isNewJob = true;
    } else {
      const latest = await repo.findLatestByType('cover');
      if (latest && latest.status === 'COMPLETED') {
        logger.info('cover.job.already_completed', { jobId: latest.id });
        return {
          status: 'COMPLETED',
          processed: 0,
          found: 0,
          persisted: 0,
          unchanged: 0,
          failed: 0,
          batches: 0,
          cursor: latest.cursor,
          dryRun,
          durationMs: Date.now() - start,
          jobId: latest.id,
          totalEstimate: latest.totalEstimate,
        };
      }
      if (latest && (latest.status === 'RUNNING' || latest.status === 'FAILED' || latest.status === 'PENDING' || latest.status === 'PAUSED' || latest.status === 'PAUSING')) {
        job = latest;
        // FAILED/PAUSED/PENDING will be transitioned to RUNNING atomically via tryAcquireLease (owner+status CAS),
        // no separate update to avoid window without owner.
      } else {
        const totalEstimate = await this.estimateTotal();
        job = await repo.create({
          type: 'cover',
          mode: 'needs-cover',
          batchSize: options.batchSize,
          totalEstimate,
        });
        isNewJob = true;
      }
    }

    if (job.totalEstimate === null && !isNewJob) {
      // Keep existing estimate; don't recalc mid-run to avoid fluctuation
    }

    // ── Phase 2: acquire lease atomically ────────────────────────
    const ownerId = options.ownerId ?? this.generateOwnerId();
    const acq = await repo.tryAcquireLease(job.id, ownerId, leaseCfg.leaseDurationMs);
    if (!acq.acquired) {
      const owner = acq.job?.ownerId ?? 'unknown';
      const leaseExp = acq.job?.leaseExpiresAt?.toISOString() ?? 'unknown';
      throw new Error(
        `EnrichmentJob ${job.id} already owned by ${owner} (leaseExpiresAt ${leaseExp}) — cannot acquire with owner ${ownerId}`,
      );
    }
    job = acq.job!;

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let leaseLost = false;
    let isPaused = false;
    const startHeartbeat = () => {
      heartbeatTimer = setInterval(async () => {
        try {
          const res = await repo.heartbeat(job!.id, ownerId, leaseCfg.leaseDurationMs);
          if (!res.renewed) {
            leaseLost = true;
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            logger.warn('cover.job.lease_lost', { jobId: job!.id, ownerId });
          } else {
            job = res.job!;
          }
        } catch {
          leaseLost = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, leaseCfg.heartbeatIntervalMs);
      if (heartbeatTimer && typeof (heartbeatTimer as unknown as { unref?: () => void }).unref === 'function') {
        (heartbeatTimer as unknown as { unref: () => void }).unref();
      }
    };
    startHeartbeat();

    // Graceful shutdown: SIGTERM/SIGINT → requestPause + wait for batch commit
    let gracefulShutdownRequested = false;
    const sigHandler = (sig: string) => {
      if (gracefulShutdownRequested) return;
      gracefulShutdownRequested = true;
      const jid = job?.id ?? 'unknown';
      logger.info('cover.job.graceful_shutdown_signal', { jobId: jid, signal: sig });
      if (job) void repo.requestPause(job.id).catch(() => {});
      // Timeout guard — if batch never commits, let lease expire naturally (RUNNING orphan)
      const t = setTimeout(() => {
        logger.warn('cover.job.graceful_shutdown_timeout', { jobId: jid });
      }, leaseCfg.gracefulShutdownTimeoutMs);
      if (typeof (t as unknown as { unref?: () => void }).unref === 'function') (t as unknown as { unref: () => void }).unref();
    };
    const onSigTerm = () => sigHandler('SIGTERM');
    const onSigInt = () => sigHandler('SIGINT');
    process.on('SIGTERM', onSigTerm);
    process.on('SIGINT', onSigInt);
    const cleanupSignals = () => {
      process.off('SIGTERM', onSigTerm);
      process.off('SIGINT', onSigInt);
    };

    let cursor = job.cursor;
    let processed = job.processed;
    let found = job.found;
    let persisted = job.persisted;
    let unchanged = job.unchanged;
    let failed = job.failed;
    let batches = 0;
    let exhausted = false;
    const runStartProcessed = processed;

    const persistProgress = async (status: 'RUNNING' | 'COMPLETED' | 'FAILED', error?: string): Promise<void> => {
      await repo.commitProgress(job!.id, {
        cursor,
        processed,
        succeeded: persisted,
        found,
        persisted,
        unchanged,
        failed,
      });
      if (status !== 'RUNNING') {
        await repo.update(job!.id, {
          status: status as EnrichmentJob['status'],
          error: error ?? null,
          completedAt: status === 'COMPLETED' ? new Date() : null,
        });
        job = await repo.findById(job!.id);
      } else {
        job = await repo.findById(job!.id);
      }
      if (fallbackCheckpoints) {
        try {
          await fallbackCheckpoints.save({
            key: COVER_ENRICHMENT_CHECKPOINT_KEY,
            mode: 'needs-cover',
            cursor,
            status,
            processed,
            found,
            persisted,
            unchanged,
            failed,
            error,
          });
        } catch {
          // Compat write is best-effort; job is authoritative
        }
      }
    };

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const releaseIfOwned = async () => {
      try {
        await repo.releaseLease(job!.id, ownerId);
      } catch {
        // best-effort
      }
    };

    try {
      for (;;) {
        if (leaseLost) {
          throw new Error(`Lease lost for job ${job.id} owner ${ownerId} — stopping`);
        }
        if (limit !== undefined && processed - runStartProcessed >= limit) break;
        const remaining = limit === undefined ? undefined : limit - (processed - runStartProcessed);
        const fetchSize =
          remaining === undefined ? options.batchSize : Math.min(options.batchSize, remaining);
        const page = await this.gameRepository.findMany({
          needsCover: true,
          afterDomainId: cursor === '' ? undefined : cursor,
          sort: { field: 'domainId', direction: 'asc' },
          limit: fetchSize,
        });
        if (page.items.length === 0) {
          exhausted = true;
          break;
        }

        for (const game of page.items) {
          if (leaseLost) break;
          try {
            const res = await this.coverService.getGameCover(game.id);
            processed += 1;
            if (res.data.selected) {
              found += 1;
              if (res.origin === 'scraper') persisted += 1;
              else unchanged += 1;
            } else {
              unchanged += 1;
            }
            cursor = game.id;
          } catch (err) {
            failed += 1;
            processed += 1;
            cursor = game.id;
            logger.warn('cover.enrich.item.failed', {
              gameId: game.id,
              jobId: job.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          if (limit !== undefined && processed - runStartProcessed >= limit) break;
        }
        if (leaseLost) {
          throw new Error(`Lease lost for job ${job.id} owner ${ownerId} — aborting batch commit`);
        }
        batches += 1;
        await persistProgress('RUNNING');
        logger.info('cover.job.progress', { jobId: job.id, cursor, processed, batches });

        // ── Phase 3: observe PAUSING → finish batch → PAUSED ──
        const freshAfterBatch = await repo.findById(job.id);
        if (freshAfterBatch) job = freshAfterBatch;
        if (job.status === 'PAUSING') {
          const pa = await repo.completePause(job.id, ownerId);
          if (pa.paused && pa.job) {
            job = pa.job;
            isPaused = true;
            stopHeartbeat();
            cleanupSignals();
            logger.info('cover.job.paused', { jobId: job.id, cursor, processed });
            break;
          } else {
            // Lost ownership during PAUSING (lease expiry + takeover) — stop without pausing
            leaseLost = true;
            stopHeartbeat();
            cleanupSignals();
            throw new Error(`Lease lost while finalizing pause for job ${job.id}`);
          }
        }

        if (delayMs > 0) {
          const more = limit === undefined || processed - runStartProcessed < limit;
          if (more) await new Promise((r) => setTimeout(r, delayMs));
        }
        if (limit !== undefined && processed - runStartProcessed >= limit) break;
      }
    } catch (error) {
      stopHeartbeat();
      cleanupSignals();
      if (leaseLost) {
        throw error;
      }
      try {
        await persistProgress('FAILED', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      } catch (pe) {
        logger.warn('cover.job.persist_failed', {
          jobId: job.id,
          error: pe instanceof Error ? pe.message : String(pe),
        });
      } finally {
        await releaseIfOwned();
      }
      throw error;
    }

    if (isPaused) {
      const finalPaused = await repo.findById(job.id);
      return {
        status: 'PAUSED' as const,
        processed: finalPaused?.processed ?? processed,
        found: finalPaused?.found ?? found,
        persisted: finalPaused?.persisted ?? persisted,
        unchanged: finalPaused?.unchanged ?? unchanged,
        failed: finalPaused?.failed ?? failed,
        batches,
        cursor: finalPaused?.cursor ?? cursor,
        dryRun,
        durationMs: Date.now() - start,
        jobId: job.id,
        totalEstimate: finalPaused?.totalEstimate ?? job.totalEstimate,
      };
    }

    const status = exhausted ? 'COMPLETED' : 'RUNNING';
    stopHeartbeat();
    cleanupSignals();
    await persistProgress(status);
    await releaseIfOwned();
    const finalJob = await repo.findById(job.id);
    return {
      status,
      processed: finalJob?.processed ?? processed,
      found: finalJob?.found ?? found,
      persisted: finalJob?.persisted ?? persisted,
      unchanged: finalJob?.unchanged ?? unchanged,
      failed: finalJob?.failed ?? failed,
      batches,
      cursor: finalJob?.cursor ?? cursor,
      dryRun,
      durationMs: Date.now() - start,
      jobId: job.id,
      totalEstimate: finalJob?.totalEstimate ?? job.totalEstimate,
    };
  }

  private async estimateTotal(): Promise<number | null> {
    try {
      const page = await this.gameRepository.findMany({
        needsCover: true,
        sort: { field: 'domainId', direction: 'asc' },
        limit: 1,
      });
      return page.total;
    } catch {
      return null;
    }
  }

  // ── Legacy checkpoint path (accumulated-counter fix) ──────────

  private async runWithCheckpoint(
    checkpoints: CoverCheckpointRepository | undefined,
    options: CoverEnrichmentRunnerOptions,
  ): Promise<CoverMassRunResult> {
    const start = Date.now();
    const dryRun = options.dryRun ?? false;
    const delayMs = options.delayMs ?? 0;
    const limit = options.limit;
    if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
      throw new Error(`runMass: batchSize must be positive (got ${options.batchSize})`);
    }
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error(`runMass: limit must be positive (got ${limit})`);
    }

    const stored = checkpoints ? await checkpoints.load(COVER_ENRICHMENT_CHECKPOINT_KEY) : undefined;
    if (stored && stored.status === 'COMPLETED' && !options.restart) {
      logger.info('cover.checkpoint.already_completed', { key: stored.key });
      return {
        status: 'COMPLETED',
        processed: 0,
        found: 0,
        persisted: 0,
        unchanged: 0,
        failed: 0,
        batches: 0,
        cursor: stored.cursor,
        dryRun,
        durationMs: Date.now() - start,
      };
    }

    let cursor = options.restart ? '' : (stored?.cursor ?? '');
    let processed = 0;
    let found = 0;
    let persisted = 0;
    let unchanged = 0;
    let failed = 0;
    let batches = 0;
    let exhausted = false;

    const persist = async (
      status: 'RUNNING' | 'COMPLETED' | 'FAILED',
      error?: string,
    ): Promise<void> => {
      if (!checkpoints || dryRun) return;
      await checkpoints.save({
        key: COVER_ENRICHMENT_CHECKPOINT_KEY,
        mode: 'needs-cover',
        cursor,
        status,
        processed,
        found,
        persisted,
        unchanged,
        failed,
        error,
      });
    };

    try {
      for (;;) {
        if (limit !== undefined && processed >= limit) break;
        const fetchSize =
          limit === undefined ? options.batchSize : Math.min(options.batchSize, limit - processed);
        const page = await this.gameRepository.findMany({
          needsCover: true,
          afterDomainId: cursor === '' ? undefined : cursor,
          sort: { field: 'domainId', direction: 'asc' },
          limit: fetchSize,
        });
        if (page.items.length === 0) {
          exhausted = true;
          break;
        }

        for (const game of page.items) {
          if (dryRun) {
            processed += 1;
            found += 1;
            unchanged += 1;
            cursor = game.id;
            if (limit !== undefined && processed >= limit) break;
            continue;
          }
          try {
            const res = await this.coverService.getGameCover(game.id);
            processed += 1;
            if (res.data.selected) {
              found += 1;
              if (res.origin === 'scraper') persisted += 1;
              else unchanged += 1;
            } else {
              unchanged += 1;
            }
            cursor = game.id;
          } catch (err) {
            failed += 1;
            processed += 1;
            cursor = game.id;
            logger.warn('cover.enrich.item.failed', {
              gameId: game.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          if (limit !== undefined && processed >= limit) break;
        }
        batches += 1;
        await persist('RUNNING');
        logger.info('cover.checkpoint.advanced', { cursor, processed });

        if (delayMs > 0) {
          const more = limit === undefined || processed < limit;
          if (more) await new Promise((r) => setTimeout(r, delayMs));
        }
        if (limit !== undefined && processed >= limit) break;
      }
    } catch (error) {
      try {
        await persist('FAILED', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      } catch (pe) {
        logger.warn('cover.checkpoint.persist_failed', {
          error: pe instanceof Error ? pe.message : String(pe),
        });
      }
      throw error;
    }

    const status = exhausted ? 'COMPLETED' : 'RUNNING';
    await persist(status);
    return {
      status,
      processed,
      found,
      persisted,
      unchanged,
      failed,
      batches,
      cursor,
      dryRun,
      durationMs: Date.now() - start,
    };
  }
}
