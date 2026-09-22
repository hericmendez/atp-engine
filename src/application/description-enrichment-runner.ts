import type { GameRepository } from '../domain/game/game-repository.js';
import type { EnrichmentJobRepository } from '../domain/enrichment-job/enrichment-job-repository.js';
import type { EnrichmentJob } from '../domain/enrichment-job/enrichment-job.js';
import { logger } from '../infrastructure/logger/logger.js';
import { resolveLeaseConfig } from '../domain/enrichment-job/lease-config.js';
import type { DescriptionEnrichmentService } from './description-enrichment-service.js';

export interface DescriptionMassRunResult {
  readonly status: 'COMPLETED' | 'RUNNING' | 'PAUSED' | 'FAILED';
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

export interface DescriptionEnrichmentRunnerOptions {
  readonly batchSize: number;
  readonly limit?: number;
  readonly dryRun?: boolean;
  readonly jobId?: string;
  readonly ownerId?: string;
  readonly leaseDurationMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly gracefulShutdownTimeoutMs?: number;
}

export class DescriptionEnrichmentRunner {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly descriptionService: DescriptionEnrichmentService,
    private readonly jobRepository?: EnrichmentJobRepository,
  ) {}

  private generateOwnerId(): string {
    const rand = Math.random().toString(36).slice(2, 6);
    return `runner:${process.pid}:${rand}`;
  }

  async runMass(
    _checkpoints: unknown,
    options: DescriptionEnrichmentRunnerOptions,
  ): Promise<DescriptionMassRunResult> {
    if (this.jobRepository) {
      return this.runWithJob(options);
    }
    throw new Error('DescriptionEnrichmentRunner requires EnrichmentJobRepository');
  }

  private async runWithJob(options: DescriptionEnrichmentRunnerOptions): Promise<DescriptionMassRunResult> {
    const start = Date.now();
    const dryRun = options.dryRun ?? false;
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

    if (dryRun) {
      let cursor = '';
      let processed = 0;
      let batches = 0;
      let exhausted = false;
      for (;;) {
        if (limit !== undefined && processed >= limit) break;
        const fetchSize = limit === undefined ? options.batchSize : Math.min(options.batchSize, limit - processed);
        const page = await this.gameRepository.findMany({
          needsDescription: true,
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
          cursor = game.id;
          if (limit !== undefined && processed >= limit) break;
        }
        batches += 1;
        if (limit !== undefined && processed >= limit) break;
      }
      return {
        status: exhausted ? 'COMPLETED' : 'RUNNING',
        processed,
        found: 0,
        persisted: 0,
        unchanged: processed,
        failed: 0,
        batches,
        cursor,
        dryRun: true,
        durationMs: Date.now() - start,
        totalEstimate: null,
      };
    }

    let job: EnrichmentJob | null = null;
    if (options.jobId) {
      job = await repo.findById(options.jobId);
      if (!job) throw new Error(`EnrichmentJob ${options.jobId} not found`);
      if (job.type !== 'description') throw new Error(`Job ${job.id} type ${job.type} is not description`);
    } else {
      const totalEstimate = await this.estimateTotal();
      job = await repo.create({
        type: 'description',
        mode: 'needs-description',
        batchSize: options.batchSize,
        totalEstimate,
      });
    }

    const ownerId = options.ownerId ?? this.generateOwnerId();
    const acq = await repo.tryAcquireLease(job.id, ownerId, leaseCfg.leaseDurationMs);
    if (!acq.acquired) {
      throw new Error(`EnrichmentJob ${job.id} already owned by ${acq.job?.ownerId ?? 'unknown'}`);
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
          } else {
            job = res.job!;
          }
        } catch {
          leaseLost = true;
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, leaseCfg.heartbeatIntervalMs);
    };
    startHeartbeat();

    let gracefulShutdownRequested = false;
    const sigHandler = () => {
      if (gracefulShutdownRequested) return;
      gracefulShutdownRequested = true;
      void repo.requestPause(job!.id).catch(() => {});
    };
    const onSigTerm = () => sigHandler();
    const onSigInt = () => sigHandler();
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

    const persistProgress = async (status: 'RUNNING' | 'COMPLETED' | 'FAILED'): Promise<void> => {
      await repo.commitProgress(job!.id, { cursor, processed, succeeded: persisted, found, persisted, unchanged, failed });
      if (status !== 'RUNNING') {
        await repo.update(job!.id, { status: status as EnrichmentJob['status'], error: status === 'FAILED' ? 'Failed' : null, completedAt: status === 'COMPLETED' ? new Date() : null });
        job = await repo.findById(job!.id);
      } else {
        job = await repo.findById(job!.id);
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
      } catch {}
    };

    try {
      for (;;) {
        if (leaseLost) throw new Error(`Lease lost for job ${job.id} owner ${ownerId}`);
        if (limit !== undefined && processed - runStartProcessed >= limit) break;
        const remaining = limit === undefined ? undefined : limit - (processed - runStartProcessed);
        const fetchSize = remaining === undefined ? options.batchSize : Math.min(options.batchSize, remaining);
        const page = await this.gameRepository.findMany({
          needsDescription: true,
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
            // Fill-only check already in service, but double-check
            if (typeof game.description === 'string' && /\S/.test(game.description)) {
              unchanged += 1;
              processed += 1;
              cursor = game.id;
              continue;
            }
            const result = await this.descriptionService.enrich(game);
            processed += 1;
            if (result.description) {
              found += 1;
              // Persist
              const updated: import('../domain/game/game.js').Game = { ...game, description: result.description };
              await this.gameRepository.update(updated);
              persisted += 1;
            } else {
              unchanged += 1;
            }
            cursor = game.id;
          } catch (err) {
            failed += 1;
            processed += 1;
            cursor = game.id;
            logger.warn('description.enrich.item.failed', { gameId: game.id, jobId: job.id, error: err instanceof Error ? err.message : String(err) });
          }
          if (limit !== undefined && processed - runStartProcessed >= limit) break;
        }
        if (leaseLost) throw new Error(`Lease lost for job ${job.id}`);
        batches += 1;
        await persistProgress('RUNNING');
        const fresh = await repo.findById(job.id);
        if (fresh) job = fresh;
        if (job.status === 'PAUSING') {
          const pa = await repo.completePause(job.id, ownerId);
          if (pa.paused && pa.job) {
            job = pa.job;
            isPaused = true;
            stopHeartbeat();
            cleanupSignals();
            break;
          } else {
            leaseLost = true;
            stopHeartbeat();
            cleanupSignals();
            throw new Error(`Lease lost while finalizing pause for job ${job.id}`);
          }
        }
        if (limit !== undefined && processed - runStartProcessed >= limit) break;
      }
    } catch (error) {
      stopHeartbeat();
      cleanupSignals();
      if (leaseLost) throw error;
      try {
        await persistProgress('FAILED');
      } catch {}
      await releaseIfOwned();
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
      const page = await this.gameRepository.findMany({ needsDescription: true, sort: { field: 'domainId', direction: 'asc' }, limit: 1 });
      return page.total;
    } catch {
      return null;
    }
  }
}
