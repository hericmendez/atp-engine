/**
 * Lease / heartbeat configuration for durable enrichment jobs.
 *
 * Lease ensures single-owner execution via Mongo CAS. Heartbeat keeps
 * ownership alive independently of batch duration.
 *
 * Invariant: heartbeatInterval < leaseDuration (otherwise lease would
 * expire before renewal). Both configurable for tests.
 */

export const DEFAULT_LEASE_DURATION_MS = 60_000; // 60s — long enough for a 50-game batch (~40s at 1.25/s)
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000; // 20s = ttl/3 — renewal before expiry even with GC pause
export const DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 30_000; // time to wait for current batch to commit before forced exit

export interface LeaseConfig {
  readonly leaseDurationMs: number;
  readonly heartbeatIntervalMs: number;
  readonly gracefulShutdownTimeoutMs: number;
}

export function resolveLeaseConfig(partial?: Partial<LeaseConfig>): LeaseConfig {
  const leaseDurationMs = partial?.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  const heartbeatIntervalMs = partial?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const gracefulShutdownTimeoutMs =
    partial?.gracefulShutdownTimeoutMs ?? DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MS;
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 1_000) {
    throw new Error(`leaseDurationMs must be >=1000 (got ${leaseDurationMs})`);
  }
  if (!Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 1_000) {
    throw new Error(`heartbeatIntervalMs must be >=1000 (got ${heartbeatIntervalMs})`);
  }
  if (heartbeatIntervalMs >= leaseDurationMs) {
    throw new Error(
      `heartbeatIntervalMs (${heartbeatIntervalMs}) must be < leaseDurationMs (${leaseDurationMs})`,
    );
  }
  if (!Number.isInteger(gracefulShutdownTimeoutMs) || gracefulShutdownTimeoutMs < 1_000) {
    throw new Error(`gracefulShutdownTimeoutMs must be >=1000 (got ${gracefulShutdownTimeoutMs})`);
  }
  return { leaseDurationMs, heartbeatIntervalMs, gracefulShutdownTimeoutMs };
}

/** Clock abstraction for deterministic lease tests. */
export interface EnrichmentJobClock {
  now(): Date;
}

export const systemClock: EnrichmentJobClock = {
  now: () => new Date(),
};

export function isLeaseExpired(job: { leaseExpiresAt: Date | null }, now: Date): boolean {
  if (!job.leaseExpiresAt) return true;
  return job.leaseExpiresAt.getTime() <= now.getTime();
}

/**
 * Active = RUNNING/PAUSING/PENDING with valid lease owned.
 * Orphan = RUNNING with leaseExpiresAt < now (recoverable, not FAILED).
 */
export function isJobActive(
  job: { status: string; ownerId: string | null; leaseExpiresAt: Date | null },
  now: Date,
): boolean {
  if (!['RUNNING', 'PAUSING', 'PENDING'].includes(job.status)) return false;
  if (!job.ownerId) return false;
  if (!job.leaseExpiresAt) return false;
  return job.leaseExpiresAt.getTime() > now.getTime();
}

export function isJobRecoverable(
  job: { status: string; leaseExpiresAt: Date | null },
  now: Date,
): boolean {
  if (job.status !== 'RUNNING' && job.status !== 'PAUSING' && job.status !== 'PENDING') return false;
  if (!job.leaseExpiresAt) return true;
  return job.leaseExpiresAt.getTime() <= now.getTime();
}
