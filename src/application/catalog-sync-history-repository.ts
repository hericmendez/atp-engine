import type {
  CatalogSyncHistory,
  SyncHistoryStatus,
  SyncTrigger,
} from './catalog-sync-history-types.js';

export type SyncHistorySortField = 'startedAt' | 'completedAt' | 'status' | 'trigger';
export type SyncHistorySortDirection = 'asc' | 'desc';

export interface SyncHistorySort {
  field: SyncHistorySortField;
  direction: SyncHistorySortDirection;
}

export interface SyncHistoryQuery {
  readonly status?: SyncHistoryStatus;
  readonly trigger?: SyncTrigger;
  readonly platformId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: SyncHistorySort;
}

export interface PaginatedSyncHistoryResult {
  readonly items: readonly CatalogSyncHistory[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface CatalogSyncHistoryRepository {
  create(entry: Omit<CatalogSyncHistory, 'id'>): Promise<string>;

  update(id: string, updates: Partial<CatalogSyncHistory>): Promise<void>;

  findById(id: string): Promise<CatalogSyncHistory | null>;

  findMany(query: SyncHistoryQuery): Promise<PaginatedSyncHistoryResult>;
}
