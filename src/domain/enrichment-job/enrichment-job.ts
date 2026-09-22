/**
 * Generic durable enrichment job — Phase 1: persistence only.
 *
 * Each job represents ONE deterministic sweep (e.g. cover enrichment over
 * `needsCover` ordered by domainId ASC). The cursor is the last
 * domainId of a *fully committed* batch ('' = nothing committed yet),
 * re-queried as `domainId > cursor` so already-covered games can never
 * cause skips. Counters are accumulated (committed) — never reset on
 * resume.
 *
 * Lease/heartbeat fields exist in the schema for Phase 2 but carry no
 * behavior in Phase 1.
 */

export type EnrichmentJobType = 'cover' | 'company' | 'description' | 'alias' | 'screenshot';

export type EnrichmentJobMode = 'needs-cover' | 'needs-companies';

export type EnrichmentJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface EnrichmentJob {
  readonly id: string;
  readonly type: EnrichmentJobType;
  readonly mode: EnrichmentJobMode;
  readonly status: EnrichmentJobStatus;
  /** Last domainId of a fully committed batch ('' = start). Documented: cursor = committed horizon. */
  readonly cursor: string;
  readonly processed: number;
  /** For cover: number of covers persisted (origin scraper). Generic "succeeded". */
  readonly succeeded: number;
  /** For cover: succeeded alias is persisted; found is same as succeeded in Phase 1. */
  readonly found: number;
  readonly persisted: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly totalEstimate: number | null;
  readonly batchSize: number;
  readonly ownerId: string | null;
  readonly leaseExpiresAt: Date | null;
  readonly lastHeartbeatAt: Date | null;
  readonly lastActivityAt: Date;
  readonly startedAt: Date | null;
  readonly pausedAt: Date | null;
  readonly completedAt: Date | null;
  readonly lastMessage: string | null;
  readonly error: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateEnrichmentJobInput {
  readonly type: EnrichmentJobType;
  readonly mode: EnrichmentJobMode;
  readonly batchSize: number;
  readonly totalEstimate?: number | null;
  readonly cursor?: string;
  readonly status?: EnrichmentJobStatus;
}

export function enrichmentJobTypeForMode(mode: EnrichmentJobMode): EnrichmentJobType {
  switch (mode) {
    case 'needs-cover':
      return 'cover';
    case 'needs-companies':
      return 'company';
    default:
      return 'cover';
  }
}
