import type {
  CatalogSyncStateRepository,
} from '../../../application/catalog-sync-state-repository.js';
import type {
  CatalogSyncState,
  CatalogSyncStateInput,
} from '../../../application/catalog-sync-state-types.js';
import { CatalogSyncStateModel } from './catalog-sync-state-schema.js';
import { PersistenceError } from '../../../shared/errors/errors.js';

function toDomain(doc: {
  source: string;
  scopeType: string;
  scopeId: string;
  pageSize: number;
  status: CatalogSyncState['status'];
  nextOffset: number;
  totalCount: number | null;
  processed: number;
  accepted: number;
  quarantined: number;
  errorCount: number;
  startedAt?: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}): CatalogSyncState {
  return {
    source: doc.source,
    scopeType: doc.scopeType,
    scopeId: doc.scopeId,
    pageSize: doc.pageSize,
    status: doc.status,
    nextOffset: doc.nextOffset,
    totalCount: doc.totalCount,
    processed: doc.processed,
    accepted: doc.accepted,
    quarantined: doc.quarantined,
    errorCount: doc.errorCount,
    startedAt: doc.startedAt?.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    completedAt: doc.completedAt?.toISOString(),
    error: doc.error,
  };
}

export class MongoCatalogSyncStateRepository implements CatalogSyncStateRepository {
  async upsert(state: CatalogSyncStateInput): Promise<CatalogSyncState> {
    try {
      const doc = await CatalogSyncStateModel.findOneAndUpdate(
        { source: state.source, scopeType: state.scopeType, scopeId: state.scopeId },
        {
          $set: {
            pageSize: state.pageSize,
            status: state.status,
            nextOffset: state.nextOffset,
            totalCount: state.totalCount,
            processed: state.processed,
            accepted: state.accepted,
            quarantined: state.quarantined,
            errorCount: state.errorCount,
            startedAt: state.startedAt ? new Date(state.startedAt) : undefined,
            completedAt: state.completedAt ? new Date(state.completedAt) : undefined,
            error: state.error,
          },
        },
        { upsert: true, new: true },
      ).lean();
      if (!doc) {
        throw new PersistenceError('Failed to upsert catalog sync state');
      }
      return toDomain(doc);
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError('Failed to upsert catalog sync state', { cause: error });
    }
  }

  async findByScope(
    source: string,
    scopeType: string,
    scopeId: string,
  ): Promise<CatalogSyncState | null> {
    try {
      const doc = await CatalogSyncStateModel.findOne({
        source,
        scopeType,
        scopeId,
      }).lean();
      return doc ? toDomain(doc) : null;
    } catch (error) {
      throw new PersistenceError('Failed to find catalog sync state', { cause: error });
    }
  }

  async findBySource(source: string): Promise<readonly CatalogSyncState[]> {
    try {
      const docs = await CatalogSyncStateModel.find({ source })
        .sort({ scopeType: 1, scopeId: 1 })
        .lean();
      return docs.map(toDomain);
    } catch (error) {
      throw new PersistenceError('Failed to list catalog sync states', { cause: error });
    }
  }
}
