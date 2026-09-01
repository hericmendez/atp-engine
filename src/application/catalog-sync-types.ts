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
