import type {
  CatalogSyncState,
  CatalogSyncStateInput,
} from './catalog-sync-state-types.js';

export interface CatalogSyncStateRepository {
  /**
   * Create or replace the checkpoint for a scope. Scopes are unique by
   * (source, scopeType, scopeId), so repeated calls never duplicate —
   * each call replaces the previous checkpoint row for the scope.
   * Callers advance the checkpoint only after a page fully completes.
   */
  upsert(state: CatalogSyncStateInput): Promise<CatalogSyncState>;

  findByScope(
    source: string,
    scopeType: string,
    scopeId: string,
  ): Promise<CatalogSyncState | null>;

  findBySource(source: string): Promise<readonly CatalogSyncState[]>;
}
