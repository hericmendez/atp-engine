import type {
  EnrichmentJob,
  CreateEnrichmentJobInput,
} from '../../../domain/enrichment-job/enrichment-job.js';
import type {
  EnrichmentJobRepository,
  EnrichmentJobUpdate,
} from '../../../domain/enrichment-job/enrichment-job-repository.js';
import type { EnrichmentJobStatus, EnrichmentJobType } from '../../../domain/enrichment-job/enrichment-job.js';
import { EnrichmentJobModel } from './enrichment-job-schema.js';

function toDomain(doc: {
  _id: unknown;
  type: string;
  mode: string;
  status: string;
  cursor: string;
  processed: number;
  succeeded: number;
  found: number;
  persisted: number;
  unchanged: number;
  failed: number;
  totalEstimate: number | null;
  batchSize: number;
  ownerId: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastActivityAt: Date;
  startedAt: Date | null;
  pausedAt: Date | null;
  completedAt: Date | null;
  lastMessage: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): EnrichmentJob {
  return {
    id: String(doc._id),
    type: doc.type as EnrichmentJobType,
    mode: doc.mode as EnrichmentJob['mode'],
    status: doc.status as EnrichmentJobStatus,
    cursor: doc.cursor,
    processed: doc.processed,
    succeeded: doc.succeeded,
    found: doc.found,
    persisted: doc.persisted,
    unchanged: doc.unchanged,
    failed: doc.failed,
    totalEstimate: doc.totalEstimate,
    batchSize: doc.batchSize,
    ownerId: doc.ownerId,
    leaseExpiresAt: doc.leaseExpiresAt,
    lastHeartbeatAt: doc.lastHeartbeatAt,
    lastActivityAt: doc.lastActivityAt,
    startedAt: doc.startedAt,
    pausedAt: doc.pausedAt,
    completedAt: doc.completedAt,
    lastMessage: doc.lastMessage,
    error: doc.error,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class LeaseLostError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly ownerId: string,
  ) {
    super(`Lease lost for job ${jobId} owner ${ownerId}`);
    this.name = 'LeaseLostError';
  }
}

export class MongoEnrichmentJobRepository implements EnrichmentJobRepository {
  constructor(private readonly clock: { now(): Date } = { now: () => new Date() }) {}

  async create(input: CreateEnrichmentJobInput): Promise<EnrichmentJob> {
    const now = new Date();
    const doc = await EnrichmentJobModel.create({
      type: input.type,
      mode: input.mode,
      status: input.status ?? 'RUNNING',
      cursor: input.cursor ?? '',
      processed: 0,
      succeeded: 0,
      found: 0,
      persisted: 0,
      unchanged: 0,
      failed: 0,
      totalEstimate: input.totalEstimate ?? null,
      batchSize: input.batchSize,
      lastActivityAt: now,
      startedAt: now,
    });
    const fresh = await EnrichmentJobModel.findById(doc._id).lean();
    if (!fresh) throw new Error('EnrichmentJob: create returned no document');
    return toDomain(fresh as Parameters<typeof toDomain>[0]);
  }

  async findById(id: string): Promise<EnrichmentJob | null> {
    const doc = await EnrichmentJobModel.findById(id).lean();
    if (!doc) return null;
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }

  async findActiveByType(type: EnrichmentJobType): Promise<EnrichmentJob | null> {
    const doc = await EnrichmentJobModel.findOne({
      type,
      status: { $in: ['RUNNING', 'PAUSING', 'PENDING'] },
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (!doc) return null;
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }

  async findLatestByType(type: EnrichmentJobType): Promise<EnrichmentJob | null> {
    const doc = await EnrichmentJobModel.findOne({ type }).sort({ updatedAt: -1 }).lean();
    if (!doc) return null;
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }

  async update(id: string, patch: EnrichmentJobUpdate): Promise<EnrichmentJob> {
    const update: Record<string, unknown> = { ...patch, lastActivityAt: patch.lastActivityAt ?? new Date() };
    // Remove undefined to avoid $set undefined
    for (const k of Object.keys(update)) {
      if ((update as Record<string, unknown>)[k] === undefined) delete (update as Record<string, unknown>)[k];
    }
    const doc = await EnrichmentJobModel.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!doc) throw new Error(`EnrichmentJob ${id} not found for update`);
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }

  async commitProgress(
    id: string,
    progress: {
      cursor: string;
      processed: number;
      succeeded: number;
      found: number;
      persisted: number;
      unchanged: number;
      failed: number;
    },
  ): Promise<EnrichmentJob> {
    const doc = await EnrichmentJobModel.findByIdAndUpdate(
      id,
      {
        $set: {
          cursor: progress.cursor,
          processed: progress.processed,
          succeeded: progress.succeeded,
          found: progress.found,
          persisted: progress.persisted,
          unchanged: progress.unchanged,
          failed: progress.failed,
          lastActivityAt: new Date(),
        },
      },
      { new: true },
    ).lean();
    if (!doc) throw new Error(`EnrichmentJob ${id} not found for commitProgress`);
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }

  async transition(
    id: string,
    from: readonly EnrichmentJobStatus[],
    to: EnrichmentJobStatus,
    patch?: EnrichmentJobUpdate,
  ): Promise<EnrichmentJob | null> {
    const update: Record<string, unknown> = { status: to, ...(patch ?? {}) };
    if (to === 'COMPLETED') update.completedAt = new Date();
    if (to === 'PAUSED') update.pausedAt = new Date();
    if (to === 'FAILED' || to === 'COMPLETED') update.lastActivityAt = new Date();
    const doc = await EnrichmentJobModel.findOneAndUpdate(
      { _id: id, status: { $in: [...from] } },
      { $set: update },
      { new: true },
    ).lean();
    if (!doc) return null;
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }

  async tryAcquireLease(
    jobId: string,
    ownerId: string,
    leaseDurationMs: number,
  ): Promise<{ acquired: boolean; job: EnrichmentJob | null }> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + leaseDurationMs);
    // Not COMPLETED/CANCELLED, and (no owner OR expired OR same owner)
    const doc = await EnrichmentJobModel.findOneAndUpdate(
      {
        _id: jobId,
        status: { $in: ['PENDING', 'RUNNING', 'FAILED', 'PAUSING', 'PAUSED'] },
        $or: [
          { ownerId: null },
          { ownerId },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          ownerId,
          leaseExpiresAt: expiresAt,
          lastHeartbeatAt: now,
          lastActivityAt: now,
          status: 'RUNNING',
          error: null,
        },
      },
      { new: true },
    ).lean();
    if (!doc) {
      const current = await EnrichmentJobModel.findById(jobId).lean();
      return { acquired: false, job: current ? toDomain(current as Parameters<typeof toDomain>[0]) : null };
    }
    return { acquired: true, job: toDomain(doc as Parameters<typeof toDomain>[0]) };
  }

  async heartbeat(
    jobId: string,
    ownerId: string,
    leaseDurationMs: number,
  ): Promise<{ renewed: boolean; job: EnrichmentJob | null }> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + leaseDurationMs);
    const doc = await EnrichmentJobModel.findOneAndUpdate(
      { _id: jobId, ownerId },
      { $set: { leaseExpiresAt: expiresAt, lastHeartbeatAt: now, lastActivityAt: now } },
      { new: true },
    ).lean();
    if (!doc) {
      const current = await EnrichmentJobModel.findById(jobId).lean();
      return { renewed: false, job: current ? toDomain(current as Parameters<typeof toDomain>[0]) : null };
    }
    return { renewed: true, job: toDomain(doc as Parameters<typeof toDomain>[0]) };
  }

  async releaseLease(jobId: string, ownerId: string): Promise<{ released: boolean; job: EnrichmentJob | null }> {
    const now = this.clock.now();
    const doc = await EnrichmentJobModel.findOneAndUpdate(
      { _id: jobId, ownerId },
      { $set: { ownerId: null, leaseExpiresAt: null, lastHeartbeatAt: null, lastActivityAt: now } },
      { new: true },
    ).lean();
    if (!doc) {
      const current = await EnrichmentJobModel.findById(jobId).lean();
      return { released: false, job: current ? toDomain(current as Parameters<typeof toDomain>[0]) : null };
    }
    return { released: true, job: toDomain(doc as Parameters<typeof toDomain>[0]) };
  }

  async requestPause(jobId: string): Promise<{ requested: boolean; job: EnrichmentJob | null }> {
    const now = this.clock.now();
    const doc = await EnrichmentJobModel.findOneAndUpdate(
      { _id: jobId, status: 'RUNNING' },
      { $set: { status: 'PAUSING', lastActivityAt: now } },
      { new: true },
    ).lean();
    if (!doc) {
      const current = await EnrichmentJobModel.findById(jobId).lean();
      const cur = current ? toDomain(current as Parameters<typeof toDomain>[0]) : null;
      // Already PAUSING/PAUSED is idempotent success? Spec says PAUSED→PAUSED no effect, but requestPause on PAUSING should be considered already requested.
      if (cur && (cur.status === 'PAUSING' || cur.status === 'PAUSED')) {
        return { requested: true, job: cur };
      }
      return { requested: false, job: cur };
    }
    return { requested: true, job: toDomain(doc as Parameters<typeof toDomain>[0]) };
  }

  async completePause(jobId: string, ownerId: string): Promise<{ paused: boolean; job: EnrichmentJob | null }> {
    const now = this.clock.now();
    const doc = await EnrichmentJobModel.findOneAndUpdate(
      { _id: jobId, status: 'PAUSING', ownerId },
      {
        $set: {
          status: 'PAUSED',
          ownerId: null,
          leaseExpiresAt: null,
          lastHeartbeatAt: null,
          pausedAt: now,
          lastActivityAt: now,
        },
      },
      { new: true },
    ).lean();
    if (!doc) {
      const current = await EnrichmentJobModel.findById(jobId).lean();
      const cur = current ? toDomain(current as Parameters<typeof toDomain>[0]) : null;
      if (cur && cur.status === 'PAUSED') return { paused: true, job: cur };
      return { paused: false, job: cur };
    }
    return { paused: true, job: toDomain(doc as Parameters<typeof toDomain>[0]) };
  }

  async findRecent(limit = 10): Promise<EnrichmentJob[]> {
    const docs = await EnrichmentJobModel.find({}).sort({ updatedAt: -1 }).limit(limit).lean();
    return docs.map((d) => toDomain(d as Parameters<typeof toDomain>[0]));
  }

  async findRecentByType(type: EnrichmentJobType, limit = 10): Promise<EnrichmentJob[]> {
    const docs = await EnrichmentJobModel.find({ type }).sort({ updatedAt: -1 }).limit(limit).lean();
    return docs.map((d) => toDomain(d as Parameters<typeof toDomain>[0]));
  }

  async findPaginated(query: {
    type?: EnrichmentJobType;
    status?: EnrichmentJobStatus;
    page?: number;
    limit?: number;
    sort?: 'startedAt' | 'updatedAt' | 'status';
    order?: 'asc' | 'desc';
  }): Promise<{ items: EnrichmentJob[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const sortField = query.sort ?? 'updatedAt';
    const order = query.order === 'asc' ? 1 : -1;
    const filter: Record<string, unknown> = {};
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    const sortMap: Record<string, string> = {
      startedAt: 'startedAt',
      updatedAt: 'updatedAt',
      status: 'status',
    };
    const sortKey = sortMap[sortField] ?? 'updatedAt';
    const [docs, total] = await Promise.all([
      EnrichmentJobModel.find(filter)
        .sort({ [sortKey]: order })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      EnrichmentJobModel.countDocuments(filter),
    ]);
    return {
      items: docs.map((d) => toDomain(d as Parameters<typeof toDomain>[0])),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
