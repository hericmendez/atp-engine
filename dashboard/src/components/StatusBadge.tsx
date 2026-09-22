import React from 'react';

export const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'Pending', bg: 'var(--badge-pending-bg)', color: 'var(--badge-pending-text)' },
  RUNNING: { label: 'Running', bg: 'var(--badge-running-bg)', color: 'var(--badge-running-text)' },
  PAUSING: { label: 'Pausing', bg: 'var(--badge-pausing-bg)', color: 'var(--badge-pausing-text)' },
  PAUSED: { label: 'Paused', bg: 'var(--badge-paused-bg)', color: 'var(--badge-paused-text)' },
  FAILED: { label: 'Failed', bg: 'var(--badge-failed-bg)', color: 'var(--badge-failed-text)' },
  COMPLETED: { label: 'Completed', bg: 'var(--badge-completed-bg)', color: 'var(--badge-completed-text)' },
  CANCELLED: { label: 'Cancelled', bg: 'var(--badge-cancelled-bg)', color: 'var(--badge-cancelled-text)' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: 'var(--badge-neutral-bg)', color: 'var(--badge-neutral-text)' };
  const isPausing = status === 'PAUSING';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 12,
        background: cfg.bg,
        color: cfg.color,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {isPausing && (
        <span
          aria-label="pausing"
          style={{
            width: 10,
            height: 10,
            border: `2px solid ${cfg.color}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      )}
      {cfg.label}
      {isPausing && <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>}
    </span>
  );
}
