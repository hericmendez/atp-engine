/**
 * Minimal checkpoint for long enrichment sweeps (single-process CLI).
 *
 * The row represents ONE position: the last attempted domainId in the
 * deterministic domainId ASC ordering ("cursor"), never a skip offset
 * or a list of IDs. Resume re-queries the live need-set with
 * `domainId > cursor`, so documents that stop matching mid-run can
 * never cause skips, repeats, or loss. Failed items are counted and
 * passed over (never silently dropped): they stay needy in the
 * catalog and remain explicitly reprocessable via --ids.
 */

export const ENRICHMENT_CHECKPOINT_KEY = 'needs-companies';

export type EnrichmentCheckpointStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface EnrichmentCheckpoint {
  readonly key: string;
  readonly mode: 'needs-companies';
  /** Last attempted domainId ('' = nothing attempted yet). */
  readonly cursor: string;
  readonly status: EnrichmentCheckpointStatus;
  readonly processed: number;
  readonly enriched: number;
  readonly failed: number;
  readonly error?: string;
  readonly updatedAt: string;
}

export type EnrichmentCheckpointInput = Omit<EnrichmentCheckpoint, 'updatedAt'>;
