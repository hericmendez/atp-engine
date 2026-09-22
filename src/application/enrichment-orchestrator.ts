import { CoverEnrichmentRunner } from './cover-enrichment-runner.js';
import { DescriptionEnrichmentRunner } from './description-enrichment-runner.js';
import { CompanyEnrichmentRunner } from './company-enrichment-runner.js';
import type { EnrichmentJobRepository } from '../domain/enrichment-job/enrichment-job-repository.js';
import type { EnrichmentJob } from '../domain/enrichment-job/enrichment-job.js';
import { ConflictError } from '../shared/errors/errors.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface EnrichmentOrchestratorOptions {
  readonly batchSize?: number;
  readonly limit?: number;
}

const DEFAULT_BATCH_SIZE = 50;
const ACTIVE_STATUSES: EnrichmentJob['status'][] = ['RUNNING', 'PAUSING', 'PAUSED', 'PENDING', 'FAILED'];

const creationLocks = new Map<string, Promise<EnrichmentJob>>();

export class EnrichmentOrchestrator {
  private readonly activeRuns = new Map<string, Promise<void>>();
  private shuttingDown = false;

  constructor(
    private readonly jobRepository: EnrichmentJobRepository,
    private readonly coverRunner: CoverEnrichmentRunner,
    private readonly descriptionRunner?: DescriptionEnrichmentRunner,
    private readonly companyRunner?: CompanyEnrichmentRunner,
  ) {}

  async createAndStart(
    input: EnrichmentOrchestratorOptions & { type: string },
  ): Promise<EnrichmentJob> {
    if (this.shuttingDown) {
      throw new ConflictError('Enrichment orchestrator is shutting down') as unknown as Error;
    }
    if (input.type !== 'cover' && input.type !== 'description' && input.type !== 'company') {
      throw new ConflictError(`Enrichment type ${input.type} not supported`) as unknown as Error;
    }

    const type = input.type as 'cover' | 'description' | 'company';
    const batchSize = input.batchSize ?? DEFAULT_BATCH_SIZE;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
      throw new ConflictError('batchSize must be integer 1..100') as unknown as Error;
    }
    const limit = input.limit;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new ConflictError('limit must be positive integer') as unknown as Error;
    }

    // Serialize creation per type to avoid race between findLatestByType and create
    const existingLock = creationLocks.get(type);
    if (existingLock) {
      await existingLock.catch(() => {});
    }

    let resolveLock!: (v: EnrichmentJob) => void;
    let rejectLock!: (e: Error) => void;
    const lockPromise = new Promise<EnrichmentJob>((res, rej) => {
      resolveLock = res;
      rejectLock = rej;
    });
    // Prevent unhandledRejection if lock is rejected (e.g., 409)
    lockPromise.catch(() => {});
    creationLocks.set(type, lockPromise);

    try {
      const latest = await this.jobRepository.findLatestByType(type);
      if (latest && ACTIVE_STATUSES.includes(latest.status)) {
        throw new ConflictError(`Active job already exists for type=${type}: ${latest.id} status ${latest.status}`);
      }

      const totalEstimate = await this.estimateTotal(type);
      const mode = type === 'cover' ? 'needs-cover' : type === 'description' ? 'needs-description' : 'needs-companies';
      const job = await this.jobRepository.create({
        type,
        mode: mode as EnrichmentJob['mode'],
        batchSize,
        totalEstimate,
      });

      // Start runner in background, not blocking HTTP
      const runner = type === 'cover' ? this.coverRunner : type === 'description' ? this.descriptionRunner : this.companyRunner;
      if (!runner) {
        throw new ConflictError(`Runner for type ${type} not configured`) as unknown as Error;
      }
      const runPromise = new Promise<void>((resolve) => {
        setImmediate(() => {
          void (runner as CoverEnrichmentRunner)
            .runMass(undefined, {
              jobId: job.id,
              batchSize,
              limit,
            } as unknown as Parameters<CoverEnrichmentRunner['runMass']>[1])
            .catch((err) => {
              logger.error('enrichment.orchestrator.run_failed', {
                jobId: job.id,
                error: err instanceof Error ? err.message : String(err),
              });
            })
            .finally(() => {
              this.activeRuns.delete(job.id);
              resolve();
            });
        });
      });
      this.activeRuns.set(job.id, runPromise);
      // Ensure cleanup even if runMass throws synchronously before returning promise
      runPromise.catch(() => this.activeRuns.delete(job.id));

      resolveLock(job);
      return job;
    } catch (err) {
      rejectLock(err as Error);
      throw err;
    } finally {
      // Clean up lock after settle, but keep for a tick to serialize
      setImmediate(() => {
        if (creationLocks.get(type) === lockPromise) creationLocks.delete(type);
      });
    }
  }

  private async estimateTotal(_type?: string): Promise<number | null> {
    return null;
  }

  hasActiveRuns(): boolean {
    return this.activeRuns.size > 0;
  }

  getActiveJobIds(): string[] {
    return [...this.activeRuns.keys()];
  }

  async waitForActiveRuns(timeoutMs = 30000): Promise<void> {
    if (this.activeRuns.size === 0) return;
    const promises = [...this.activeRuns.values()];
    const timeout = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('waitForActiveRuns timeout')), timeoutMs));
    try {
      await Promise.race([Promise.all(promises), timeout]);
    } catch (e) {
      if ((e as Error).message === 'waitForActiveRuns timeout') {
        logger.warn('enrichment.orchestrator.wait_timeout', { active: this.activeRuns.size, timeoutMs });
      } else {
        throw e;
      }
    }
  }

  async requestGracefulShutdown(timeoutMs = 30000): Promise<void> {
    this.shuttingDown = true;
    if (this.activeRuns.size === 0) return;
    logger.info('enrichment.orchestrator.shutdown.request', { active: this.activeRuns.size });
    for (const jobId of this.activeRuns.keys()) {
      try {
        await this.jobRepository.requestPause(jobId);
      } catch {}
    }
    await this.waitForActiveRuns(timeoutMs);
    logger.info('enrichment.orchestrator.shutdown.complete', { active: this.activeRuns.size });
  }

  // For testing: clear locks
  static clearLocks(): void {
    creationLocks.clear();
  }

  // For testing: clear active runs (not for production)
  clearActiveRunsForTest(): void {
    this.activeRuns.clear();
    this.shuttingDown = false;
  }
}
