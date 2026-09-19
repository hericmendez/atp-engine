import type { PlatformCatalogEntry } from '../domain/platform/platform-catalog.js';

export interface SyncDateRange {
  readonly from: string;
  readonly to: string;
}

export interface SyncRequest {
  readonly platforms?: readonly string[];
  readonly activeOnly?: boolean;
  readonly from: string;
  readonly to: string;
  readonly dryRun?: boolean;
  readonly trigger?: 'manual' | 'scheduled';
}

export type SyncPlatformStatus = 'completed' | 'failed';

export interface PlatformSyncResult {
  readonly platformId: string;
  readonly platformName: string;
  readonly candidatesFound: number;
  readonly newGames: number;
  readonly existingGames: number;
  readonly updatedGames: number;
  readonly rejected: number;
  readonly errors: number;
  readonly status: SyncPlatformStatus;
  readonly error?: string;
}

export interface SyncTotals {
  readonly candidatesFound: number;
  readonly newGames: number;
  readonly existingGames: number;
  readonly updatedGames: number;
  readonly rejected: number;
  readonly errors: number;
}

export type SyncStatus = 'completed' | 'partial' | 'failed';

export interface SyncResult {
  readonly status: SyncStatus;
  readonly platforms: readonly PlatformSyncResult[];
  readonly totals: SyncTotals;
  readonly dryRun: boolean;
  readonly durationMs: number;
  readonly historyId?: string;
}

export interface ResolvedPlatform {
  readonly entry: PlatformCatalogEntry;
  readonly queryYear: number | null;
}

/**
 * Options for resumable enumeration ingestion over one platform scope.
 * The checkpoint row (when a state repository is wired) is keyed by
 * (source, 'platform', platformId); resuming with a different pageSize
 * is an explicit error.
 */
export interface ResumableEnumerationOptions {
  readonly pageSize: number;
  readonly dryRun?: boolean;
}

export type ResumableEnumerationStatus = 'COMPLETED' | 'FAILED';

/**
 * Run summary. Counters are cumulative across the whole scope when a
 * checkpoint row exists (continued runs keep accumulating), or limited
 * to this run when no state repository is wired.
 */
export interface ResumableEnumerationResult {
  readonly status: ResumableEnumerationStatus;
  readonly source: string;
  readonly platformId: number;
  readonly pageSize: number;
  readonly totalCount: number | null;
  /** First offset not yet completed (past totalCount when the final
   * page was partial). */
  /** First offset not yet completed (== totalCount when COMPLETED). */
  readonly nextOffset: number;
  readonly processed: number;
  readonly accepted: number;
  readonly quarantined: number;
  readonly errorCount: number;
  /** Pages fully completed by this run. */
  readonly pages: number;
  readonly dryRun: boolean;
  readonly durationMs: number;
}
