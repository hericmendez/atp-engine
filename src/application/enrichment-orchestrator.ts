import { CoverEnrichmentRunner } from './cover-enrichment-runner.js';
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
  constructor(
    private readonly jobRepository: EnrichmentJobRepository,
    private readonly runner: CoverEnrichmentRunner,
  ) {}

  async createAndStart(
    input: EnrichmentOrchestratorOptions & { type: string },
  ): Promise<EnrichmentJob> {
    if (input.type !== 'cover') {
      throw new ConflictError(`Enrichment type ${input.type} not supported`) as unknown as Error;
      // Actually 400, but orchestrator throws 400 via AppError? We'll throw AppError 400 via caller validation
    }

    const type = 'cover' as const;
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

      const totalEstimate = await this.estimateTotal();
      const job = await this.jobRepository.create({
        type,
        mode: 'needs-cover',
        batchSize,
        totalEstimate,
      });

      // Start runner in background, not blocking HTTP
      // Use setImmediate to ensure HTTP response is sent first
      setImmediate(() => {
        void this.runner
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
            // No unhandledRejection; runner already persists FAILED via persistProgress
          });
      });

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

  private async estimateTotal(): Promise<number | null> {
    // Reuse runner's estimate logic via gameRepository? For now return null to avoid extra query
    // The runner itself will estimate if needed, but we set totalEstimate via create
    // We can try to get from runner's private method? Instead, just return null
    return null;
  }

  // For testing: clear locks
  static clearLocks(): void {
    creationLocks.clear();
  }
}
