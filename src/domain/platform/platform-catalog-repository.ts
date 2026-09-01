import type { PlatformCatalogEntry, PlatformStatus } from './platform-catalog.js';

export type PlatformSortField = 'name' | 'releaseYear' | 'gameCount';
export type PlatformSortDirection = 'asc' | 'desc';

export interface PlatformSort {
  field: PlatformSortField;
  direction: PlatformSortDirection;
}

export interface PlatformCatalogQuery {
  readonly companyName?: string;
  readonly status?: PlatformStatus;
  readonly releaseYear?: number;
  readonly releaseYearRange?: { from: number; to: number };
  readonly showEmpty?: boolean;
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: PlatformSort;
}

export interface PlatformCatalogEntryWithGameCount extends PlatformCatalogEntry {
  readonly gameCount: number;
}

export interface PaginatedPlatformResult {
  readonly items: readonly PlatformCatalogEntryWithGameCount[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface PlatformCatalogRepository {
  findMany(query: PlatformCatalogQuery): Promise<PaginatedPlatformResult>;

  findById(id: string): Promise<PlatformCatalogEntryWithGameCount | null>;

  findByCompany(company: string): Promise<readonly PlatformCatalogEntryWithGameCount[]>;

  upsert(entry: PlatformCatalogEntry): Promise<void>;
}
