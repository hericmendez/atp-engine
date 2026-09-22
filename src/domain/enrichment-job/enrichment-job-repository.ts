import type {
  EnrichmentJob,
  EnrichmentJobType,
  EnrichmentJobStatus,
  CreateEnrichmentJobInput,
} from './enrichment-job.js';

export interface EnrichmentJobUpdate {
  readonly cursor?: string;
  readonly status?: EnrichmentJobStatus;
  readonly processed?: number;
  readonly succeeded?: number;
  readonly found?: number;
  readonly persisted?: number;
  readonly unchanged?: number;
  readonly failed?: number;
  readonly totalEstimate?: number | null;
  readonly lastActivityAt?: Date;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly lastMessage?: string | null;
  readonly error?: string | null;
  readonly ownerId?: string | null;
  readonly leaseExpiresAt?: Date | null;
  readonly lastHeartbeatAt?: Date | null;
  readonly pausedAt?: Date | null;
}

export interface EnrichmentJobRepository {
  create(input: CreateEnrichmentJobInput): Promise<EnrichmentJob>;
  findById(id: string): Promise<EnrichmentJob | null>;
  findActiveByType(type: EnrichmentJobType): Promise<EnrichmentJob | null>;
  findLatestByType(type: EnrichmentJobType): Promise<EnrichmentJob | null>;
  update(id: string, patch: EnrichmentJobUpdate): Promise<EnrichmentJob>;
  /**
   * Atomic progress commit: cursor + counters become the new committed horizon.
   * Implementations should use $set/$inc atomically.
   */
  commitProgress(
    id: string,
    progress: {
      cursor: string;
      processed: number;
      succeeded: number;
      found: number;
      persisted: number;
      unchanged: number;
      failed: number;
    },
  ): Promise<EnrichmentJob>;
  transition(
    id: string,
    from: readonly EnrichmentJobStatus[],
    to: EnrichmentJobStatus,
    patch?: EnrichmentJobUpdate,
  ): Promise<EnrichmentJob | null>;

  // ── Lease / Ownership (Phase 2) ──────────────────────────────
  /**
   * Atomic lease acquisition via Mongo CAS.
   * Succeeds iff job allows execution (not COMPLETED/CANCELLED) AND
   * (ownerId == null OR leaseExpired OR ownerId == requester).
   * On success sets ownerId, leaseExpiresAt=now+ttl, lastHeartbeatAt=now, status→RUNNING if needed.
   */
  tryAcquireLease(
    jobId: string,
    ownerId: string,
    leaseDurationMs: number,
  ): Promise<{ acquired: boolean; job: EnrichmentJob | null }>;
  /** Renew lease — only current owner may heartbeat. */
  heartbeat(
    jobId: string,
    ownerId: string,
    leaseDurationMs: number,
  ): Promise<{ renewed: boolean; job: EnrichmentJob | null }>;
  /** Release — only owner may release. */
  releaseLease(jobId: string, ownerId: string): Promise<{ released: boolean; job: EnrichmentJob | null }>;

  // ── Pause / Resume (Phase 3) ───────────────────────────────
  /** RUNNING → PAUSING atomically. Owner-agnostic: any caller may request pause. */
  requestPause(jobId: string): Promise<{ requested: boolean; job: EnrichmentJob | null }>;
  /**
   * PAUSING → PAUSED atomically, only owner may finalize. Clears lease.
   * Heartbeat must be stopped before calling.
   */
  completePause(jobId: string, ownerId: string): Promise<{ paused: boolean; job: EnrichmentJob | null }>;

  // ── Listing (Phase 4) ──────────────────────────────────────
  findRecent(limit?: number): Promise<EnrichmentJob[]>;
  findRecentByType(type: EnrichmentJobType, limit?: number): Promise<EnrichmentJob[]>;
  findPaginated(query: {
    type?: EnrichmentJobType;
    status?: EnrichmentJobStatus;
    page?: number;
    limit?: number;
    sort?: 'startedAt' | 'updatedAt' | 'status';
    order?: 'asc' | 'desc';
  }): Promise<{ items: EnrichmentJob[]; total: number; page: number; limit: number; totalPages: number }>;
}
