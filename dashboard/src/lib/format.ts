export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds <= 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`.replace(' 0s', 's').replace(':', 'm ');
  // m >0 case already, for m>0 with seconds
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// More precise for m case: we already handle, but keep simple
export function formatEtaPrecise(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds <= 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatRate(rate: number | null): string {
  if (rate === null || rate === undefined) return '—';
  return `${rate.toFixed(2)} items/s`;
}

export function formatTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatLeaseRemaining(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms <= 0) return '0s';
  const s = Math.round(ms / 1000);
  return `${s}s remaining`;
}

export type LeaseHealth = 'Healthy' | 'Expiring' | 'Expired' | '—';
// Frontend visual thresholds — documented, not backend rules
// Healthy: >10s remaining, Expiring: 0-10s, Expired: 0 or null when expected
export function getLeaseHealth(remainingMs: number | null, status: string): LeaseHealth {
  if (['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) return '—';
  if (remainingMs === null || remainingMs === undefined) return 'Expired';
  if (remainingMs <= 0) return 'Expired';
  if (remainingMs <= 10_000) return 'Expiring';
  return 'Healthy';
}

export function friendlyConflictMessage(code: string, message: string, status: number): string {
  if (status !== 409) return message;
  const m = message.toLowerCase();
  if (m.includes('already running') || m.includes('holds its lease') || m.includes('owner')) {
    return 'This job is already running on another worker (lease held).';
  }
  if (m.includes('already completed') || m.includes('completed')) {
    return 'This job cannot be paused or resumed because it is already completed.';
  }
  if (m.includes('cancelled')) return 'This job was cancelled and cannot be resumed.';
  if (m.includes('cannot pause')) return 'This job cannot be paused in its current state.';
  if (m.includes('cannot acquire lease')) return 'This job cannot be resumed while another worker holds its lease.';
  return message;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  if (i === 0) return `${v} B`;
  if (i === 1) return `${v.toFixed(1)} ${units[i]}`;
  if (i === 2) return `${v.toFixed(1)} ${units[i]}`;
  return `${v.toFixed(2)} ${units[i]}`;
}
