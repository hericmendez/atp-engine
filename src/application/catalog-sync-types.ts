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
  /**
   * Maximum number of candidates to process in this run (partial-run
   * support for controlled validation: 10 → 100 → 1000 → full).
   * The checkpoint still advances per fully-succeeded page, so a later
   * run without (or with a larger) limit resumes exactly where this
   * one stopped. A limit-reached run persists RUNNING, never COMPLETED.
   */
  readonly limit?: number;
  /**
   * Pause between fully-succeeded pages (IGDB rate-limit courtesy).
   * Sleeps only when another page will follow; never delays the final
   * checkpoint. No retries are attempted anywhere — a failing page
   * pins the checkpoint to FAILED and rethrows.
   */
  readonly delayMs?: number;
  /**
   * Starting offset for scopes with no checkpoint row (controlled
   * slices via CLI --offset). A stored checkpoint always wins over
   * this value on resume — offsets are never silently reprocessed.
   */
  readonly initialOffset?: number;
}

export type ResumableEnumerationStatus = 'COMPLETED' | 'FAILED' | 'LIMIT_REACHED';

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
  /**
   * Run-scoped split of accepted settlements (created = new canonical
   * games, updated = enriched/port-folded, unchanged = already current).
   * Unlike processed/accepted/quarantined above — which accumulate across
   * runs while a checkpoint row exists — these always describe only the
   * pages completed by this run, so per-platform reports add up exactly.
   */
  readonly newGames: number;
  readonly existingGames: number;
  readonly updatedGames: number;
  /** Pages fully completed by this run. */
  readonly pages: number;
  readonly dryRun: boolean;
  readonly durationMs: number;
}
