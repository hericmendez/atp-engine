export type SyncTrigger = 'manual' | 'scheduled';

export type SyncHistoryStatus = 'running' | 'completed' | 'partial' | 'failed';

export interface CatalogSyncHistoryPlatformResult {
  readonly platformId: string;
  readonly platformName: string;
  readonly candidatesFound: number;
  readonly newGames: number;
  readonly existingGames: number;
  readonly updatedGames: number;
  readonly rejected: number;
  readonly errors: number;
  readonly status: 'completed' | 'failed';
  readonly error?: string;
}

export interface CatalogSyncHistoryTotals {
  readonly candidatesFound: number;
  readonly newGames: number;
  readonly existingGames: number;
  readonly updatedGames: number;
  readonly rejected: number;
  readonly errors: number;
}

export interface CatalogSyncHistory {
  readonly id: string;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly trigger: SyncTrigger;
  readonly status: SyncHistoryStatus;
  readonly dryRun: boolean;
  readonly from: string;
  readonly to: string;
  readonly requestedPlatformIds: readonly string[];
  readonly resolvedPlatformNames: readonly string[];
  readonly totals: CatalogSyncHistoryTotals;
  readonly platformResults: readonly CatalogSyncHistoryPlatformResult[];
  readonly error: string | null;
  readonly durationMs: number | null;
}
