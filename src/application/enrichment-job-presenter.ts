import type { EnrichmentJob } from '../domain/enrichment-job/enrichment-job.js';

/**
 * Progress / Rate / ETA calculations based solely on persisted job fields.
 * totalEstimate is an initial estimate (needs-cover count at start) — not a
 * guaranteed total, so percentage/ETA are best-effort estimates.
 */

export function computePercentage(job: EnrichmentJob): number | null {
  if (job.totalEstimate === null || job.totalEstimate <= 0) return null;
  if (job.processed <= 0) return 0;
  const raw = (job.processed / job.totalEstimate) * 100;
  const capped = Math.min(100, raw);
  // rounding to 1 decimal, consistent
  return Math.round(capped * 10) / 10;
}

export function computeAverageRate(job: EnrichmentJob, now: Date = new Date()): number | null {
  if (!job.startedAt) return null;
  if (job.processed <= 0) return null;
  const elapsedMs = now.getTime() - job.startedAt.getTime();
  if (elapsedMs <= 0) return null;
  const perSec = job.processed / (elapsedMs / 1000);
  if (!Number.isFinite(perSec) || perSec <= 0) return null;
  return Math.round(perSec * 100) / 100; // 2 decimals
}

export function computeEtaSeconds(job: EnrichmentJob, now: Date = new Date()): number | null {
  if (job.totalEstimate === null || job.totalEstimate <= 0) return null;
  if (job.processed >= job.totalEstimate) return 0;
  if (job.status !== 'RUNNING' && job.status !== 'PAUSING') return null;
  const rate = computeAverageRate(job, now);
  if (rate === null || rate <= 0) return null;
  const remaining = job.totalEstimate - job.processed;
  if (remaining <= 0) return 0;
  const eta = remaining / rate;
  if (!Number.isFinite(eta) || eta < 0) return null;
  return Math.round(eta);
}

export function computeLeaseRemainingMs(job: EnrichmentJob, now: Date = new Date()): number | null {
  if (!job.leaseExpiresAt || !job.ownerId) return null;
  // PAUSED/COMPLETED should have been cleared, but guard
  if (job.status === 'PAUSED' || job.status === 'COMPLETED' || job.status === 'FAILED') return null;
  const diff = job.leaseExpiresAt.getTime() - now.getTime();
  return Math.max(0, diff);
}

export function getOperationalMessage(job: EnrichmentJob): string {
  switch (job.status) {
    case 'PENDING':
      return 'Pending';
    case 'RUNNING':
      return 'Processing cover enrichment';
    case 'PAUSING':
      return 'Pause requested; finishing current batch';
    case 'PAUSED':
      return 'Paused';
    case 'COMPLETED':
      return 'Completed';
    case 'FAILED':
      return job.error ? `Failed: ${job.error}` : 'Failed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return job.status;
  }
}

export interface EnrichmentJobApiDto {
  readonly id: string;
  readonly type: string;
  readonly mode: string;
  readonly status: string;
  readonly progress: {
    readonly processed: number;
    readonly total: number | null;
    readonly percentage: number | null;
    readonly itemsPerSecond: number | null;
    readonly etaSeconds: number | null;
  };
  readonly counters: {
    readonly succeeded: number;
    readonly found: number;
    readonly persisted: number;
    readonly unchanged: number;
    readonly failed: number;
  };
  readonly cursor: string;
  readonly owner: {
    readonly id: string | null;
    readonly leaseExpiresAt: string | null;
    readonly leaseRemainingMs: number | null;
    readonly lastHeartbeatAt: string | null;
  };
  readonly timing: {
    readonly startedAt: string | null;
    readonly pausedAt: string | null;
    readonly completedAt: string | null;
    readonly lastActivityAt: string;
    readonly updatedAt: string;
    readonly createdAt: string;
  };
  readonly error: string | null;
  readonly message: string;
}

export function toEnrichmentJobDto(job: EnrichmentJob, now: Date = new Date()): EnrichmentJobApiDto {
  return {
    id: job.id,
    type: job.type,
    mode: job.mode,
    status: job.status,
    progress: {
      processed: job.processed,
      total: job.totalEstimate,
      percentage: computePercentage(job),
      itemsPerSecond: computeAverageRate(job, now),
      etaSeconds: computeEtaSeconds(job, now),
    },
    counters: {
      succeeded: job.succeeded,
      found: job.found,
      persisted: job.persisted,
      unchanged: job.unchanged,
      failed: job.failed,
    },
    cursor: job.cursor,
    owner: {
      id: job.ownerId,
      leaseExpiresAt: job.leaseExpiresAt ? job.leaseExpiresAt.toISOString() : null,
      leaseRemainingMs: computeLeaseRemainingMs(job, now),
      lastHeartbeatAt: job.lastHeartbeatAt ? job.lastHeartbeatAt.toISOString() : null,
    },
    timing: {
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      pausedAt: job.pausedAt ? job.pausedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      lastActivityAt: job.lastActivityAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      createdAt: job.createdAt.toISOString(),
    },
    error: job.error,
    message: getOperationalMessage(job),
  };
}
