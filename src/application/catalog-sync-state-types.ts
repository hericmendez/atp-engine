/**
 * Ingestion checkpoint per catalog scope (page-level progress).
 *
 * The unit of progress is ONE enumeration page: `nextOffset` always
 * points at the first offset that has NOT been fully completed. A page
 * is only ever marked complete after ALL of its candidates were
 * processed and every resulting write finished — the checkpoint
 * advances strictly after page success, never before.
 *
 * The checkpoint is operational progress, never catalog truth: it
 * stores no games and no candidates. Reprocessing a page after a crash
 * is safe because the ingestion pipeline is idempotent (single-write
 * funnel, stable identities, idempotent edges/folds).
 *
 * Identity: (source, scopeType, scopeId). `pageSize` is stored on the
 * row and enforced on resume: continuing with a different pageSize is
 * an explicit error, never a silent continuation.
 *
 * Lifecycle: no row = never started. RUNNING = in progress or
 * interrupted (resume from nextOffset either way). COMPLETED = the
 * scoped enumeration finished (even with zero candidates — this is how
 * "0 matching games" differs from "not synchronized"). FAILED = the
 * last attempted page failed; resume retries exactly that page.
 * Single-process sequential execution only; concurrent runs over the
 * same scope are not supported (last-writer-wins on the row).
 */
export const CatalogSyncStateStatus = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

export type CatalogSyncStateStatus =
  (typeof CatalogSyncStateStatus)[keyof typeof CatalogSyncStateStatus];

export interface CatalogSyncState {
  /** Stable source key, e.g. 'igdb'. */
  readonly source: string;
  /** Scope discriminator, e.g. 'platform'. */
  readonly scopeType: string;
  /** Scope identifier, e.g. the IGDB platform id '48'. */
  readonly scopeId: string;
  /** Page size this checkpoint was created with. Resume with a
   * different pageSize is rejected — offsets are not transferable
   * across page sizes. */
  readonly pageSize: number;
  readonly status: CatalogSyncStateStatus;
  /** First offset not yet completed (past totalCount when the final
   * page was partial). */
  readonly nextOffset: number;
  /** countByPlatform() snapshot captured at run start; null when the
   * count could not be established. The scope is fixed to this value
   * for the run: items appearing afterwards are not visited. */
  readonly totalCount: number | null;
  /** Cumulative candidates seen across completed pages. */
  readonly processed: number;
  /** Cumulative canonical outcomes (new + existing + updated). */
  readonly accepted: number;
  /** Cumulative quarantined/rejected outcomes. */
  readonly quarantined: number;
  /** Cumulative per-group errors. */
  readonly errorCount: number;
  readonly startedAt?: string;
  readonly updatedAt?: string;
  readonly completedAt?: string;
  /** Last page failure, cleared on the next successful page. */
  readonly error?: string;
}

export type CatalogSyncStateInput = Omit<CatalogSyncState, 'updatedAt'> & {
  readonly updatedAt?: string;
};
