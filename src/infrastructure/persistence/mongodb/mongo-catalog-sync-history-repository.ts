import type {
  CatalogSyncHistoryRepository,
  SyncHistoryQuery,
  PaginatedSyncHistoryResult,
} from '../../../application/catalog-sync-history-repository.js';
import type { CatalogSyncHistory } from '../../../application/catalog-sync-history-types.js';
import { CatalogSyncHistoryModel } from './catalog-sync-history-schema.js';
import { PersistenceError } from '../../../shared/errors/errors.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface MongoFilter {
  [key: string]: unknown;
}

export class MongoCatalogSyncHistoryRepository implements CatalogSyncHistoryRepository {
  async create(entry: Omit<CatalogSyncHistory, 'id'>): Promise<string> {
    try {
      const doc = new CatalogSyncHistoryModel({
        startedAt: entry.startedAt,
        completedAt: entry.completedAt,
        trigger: entry.trigger,
        status: entry.status,
        dryRun: entry.dryRun,
        from: entry.from,
        to: entry.to,
        requestedPlatformIds: entry.requestedPlatformIds,
        resolvedPlatformNames: entry.resolvedPlatformNames,
        totals: entry.totals,
        platformResults: entry.platformResults,
        error: entry.error,
        durationMs: entry.durationMs,
      });

      const saved = await doc.save();
      return saved._id.toString();
    } catch (error) {
      throw new PersistenceError('Failed to create sync history record', { cause: error });
    }
  }

  async update(id: string, updates: Partial<CatalogSyncHistory>): Promise<void> {
    try {
      const setFields: Record<string, unknown> = {};

      if (updates.completedAt !== undefined) setFields.completedAt = updates.completedAt;
      if (updates.status !== undefined) setFields.status = updates.status;
      if (updates.totals !== undefined) setFields.totals = updates.totals;
      if (updates.platformResults !== undefined)
        setFields.platformResults = updates.platformResults;
      if (updates.error !== undefined) setFields.error = updates.error;
      if (updates.durationMs !== undefined) setFields.durationMs = updates.durationMs;
      if (updates.resolvedPlatformNames !== undefined) {
        setFields.resolvedPlatformNames = updates.resolvedPlatformNames;
      }

      const result = await CatalogSyncHistoryModel.updateOne({ _id: id }, { $set: setFields });

      if (result.matchedCount === 0) {
        throw new PersistenceError(`Sync history with ID ${id} not found for update`);
      }
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError('Failed to update sync history record', { cause: error });
    }
  }

  async findById(id: string): Promise<CatalogSyncHistory | null> {
    try {
      const doc = await CatalogSyncHistoryModel.findById(id).lean();
      return doc ? this.toDomain(doc) : null;
    } catch (error) {
      throw new PersistenceError('Failed to find sync history by ID', { cause: error });
    }
  }

  async findMany(query: SyncHistoryQuery): Promise<PaginatedSyncHistoryResult> {
    try {
      const filter = this.buildFilter(query);
      const page = query.page ?? DEFAULT_PAGE;
      const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const skip = (page - 1) * limit;

      const sort = this.buildSort(query.sort);

      const [docs, total] = await Promise.all([
        CatalogSyncHistoryModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
        CatalogSyncHistoryModel.countDocuments(filter),
      ]);

      const items = docs.map((doc) => this.toDomain(doc));

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new PersistenceError('Failed to find sync history records', { cause: error });
    }
  }

  private buildFilter(query: SyncHistoryQuery): MongoFilter {
    const filter: MongoFilter = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.trigger) {
      filter.trigger = query.trigger;
    }

    if (query.platformId) {
      filter.requestedPlatformIds = query.platformId;
    }

    if (query.from || query.to) {
      const dateFilter: MongoFilter = {};
      if (query.from) {
        dateFilter.$gte = new Date(query.from);
      }
      if (query.to) {
        const toEnd = new Date(query.to);
        toEnd.setUTCHours(23, 59, 59, 999);
        dateFilter.$lte = toEnd;
      }
      filter.startedAt = dateFilter;
    }

    return filter;
  }

  private buildSort(sort: SyncHistoryQuery['sort']): Record<string, 1 | -1> {
    if (!sort) {
      return { startedAt: -1 };
    }

    const fieldMap: Record<string, string> = {
      startedAt: 'startedAt',
      completedAt: 'completedAt',
      status: 'status',
      trigger: 'trigger',
    };

    const direction = sort.direction === 'asc' ? 1 : -1;
    const field = fieldMap[sort.field] ?? sort.field;

    return { [field]: direction };
  }

  private toDomain(doc: Record<string, unknown>): CatalogSyncHistory {
    const id = (doc._id as { toString(): string }).toString();
    return {
      id,
      startedAt: doc.startedAt as Date,
      completedAt: (doc.completedAt as Date | null) ?? null,
      trigger: doc.trigger as CatalogSyncHistory['trigger'],
      status: doc.status as CatalogSyncHistory['status'],
      dryRun: doc.dryRun as boolean,
      from: doc.from as string,
      to: doc.to as string,
      requestedPlatformIds: (doc.requestedPlatformIds as string[]) ?? [],
      resolvedPlatformNames: (doc.resolvedPlatformNames as string[]) ?? [],
      totals: {
        candidatesFound: (doc.totals as Record<string, number>).candidatesFound,
        newGames: (doc.totals as Record<string, number>).newGames,
        existingGames: (doc.totals as Record<string, number>).existingGames,
        updatedGames: (doc.totals as Record<string, number>).updatedGames,
        rejected: (doc.totals as Record<string, number>).rejected,
        errors: (doc.totals as Record<string, number>).errors,
      },
      platformResults: ((doc.platformResults as Record<string, unknown>[]) ?? []).map((pr) => ({
        platformId: pr.platformId as string,
        platformName: pr.platformName as string,
        candidatesFound: pr.candidatesFound as number,
        newGames: pr.newGames as number,
        existingGames: pr.existingGames as number,
        updatedGames: pr.updatedGames as number,
        rejected: pr.rejected as number,
        errors: pr.errors as number,
        status: pr.status as 'completed' | 'failed',
        error: (pr.error as string | null) ?? undefined,
      })),
      error: (doc.error as string | null) ?? null,
      durationMs: (doc.durationMs as number | null) ?? null,
    };
  }
}
