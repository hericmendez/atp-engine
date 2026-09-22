import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import type { EnrichmentJobDto } from '../api/types';
import { Loading, ErrorBox } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { formatRate, formatEtaPrecise, formatTimeAgo, getLeaseHealth, friendlyConflictMessage } from '../lib/format';

const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED'];

export function EnrichmentDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<EnrichmentJobDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [actionError, setActionError] = useState<ApiClientError | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchJob = async () => {
    if (!id) return;
    try {
      const res = await api.get<{ data: EnrichmentJobDto }>(`/api/v1/admin/enrichment/jobs/${encodeURIComponent(id)}`);
      setJob(res.data);
      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e as ApiClientError);
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!job || TERMINAL.includes(job.status)) return;
    const timer = setInterval(fetchJob, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, id]);

  const doPause = async () => {
    if (!id) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await api.post<{ data: EnrichmentJobDto }>(`/api/v1/admin/enrichment/jobs/${encodeURIComponent(id)}/pause`);
      setJob(res.data);
    } catch (e) {
      const err = e as ApiClientError;
      setActionError(new ApiClientError(err.code, friendlyConflictMessage(err.code, err.message, err.status), err.status, err.requestId));
      await fetchJob();
    } finally {
      setActionLoading(false);
    }
  };

  const doResume = async () => {
    if (!id) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await api.post<{ data: EnrichmentJobDto }>(`/api/v1/admin/enrichment/jobs/${encodeURIComponent(id)}/resume`);
      setJob(res.data);
    } catch (e) {
      const err = e as ApiClientError;
      setActionError(new ApiClientError(err.code, friendlyConflictMessage(err.code, err.message, err.status), err.status, err.requestId));
      await fetchJob();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error.message} requestId={error.requestId} />;
  if (!job) return null;

  const isPausing = job.status === 'PAUSING';
  const canPause = job.status === 'RUNNING';
  const canResume =
    ['PENDING', 'PAUSED', 'FAILED'].includes(job.status) ||
    (job.status === 'RUNNING' && (job.owner.leaseRemainingMs === null || job.owner.leaseRemainingMs <= 0));
  const isTerminalNoResume = ['COMPLETED', 'CANCELLED'].includes(job.status);

  const leaseHealth = getLeaseHealth(job.owner.leaseRemainingMs, job.status);

  return (
    <div>
      <Link to="/admin/enrichment" style={{ color: 'var(--link)', fontSize: 13 }}>← Back to jobs</Link>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '12px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 14 }}>{job.id}</span> <StatusBadge status={job.status} />
      </h2>

      {isPausing && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 12, color: '#92400e', fontSize: 13 }}>
          <strong>Pause requested.</strong> Finishing current batch… Polling continues until <code>PAUSED</code>.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {canPause && (
          <button onClick={doPause} disabled={actionLoading} style={{ ...btn, background: 'var(--error-text)', opacity: actionLoading ? 0.6 : 1 }}>
            {actionLoading ? 'Pausing…' : 'Pause'}
          </button>
        )}
        {isPausing && <span style={{ alignSelf: 'center', fontSize: 13, color: '#92400e' }}>Pausing… batch in progress</span>}
        {canResume && (
          <button onClick={doResume} disabled={actionLoading} style={{ ...btn, background: '#16a34a', opacity: actionLoading ? 0.6 : 1 }}>
            {actionLoading ? 'Resuming…' : job.status === 'PENDING' ? 'Start' : 'Resume'}
          </button>
        )}
        {isTerminalNoResume && (
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            This job is {job.status.toLowerCase()} and cannot be resumed. {job.status === 'COMPLETED' ? 'Create a new job to continue.' : ''}
          </span>
        )}
      </div>
      {actionError && (
        <div style={{ marginBottom: 12 }}>
          <ErrorBox message={actionError.message} requestId={actionError.requestId} />
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        <Card title="Status">
          <div>type: {job.type} / mode: {job.mode}</div>
          <div>
            status: <StatusBadge status={job.status} /> — {job.message}
          </div>
          {job.error && <div style={{ color: 'var(--error-text)' }}>error: {job.error}</div>}
        </Card>

        <Card title="Progress">
          {job.progress.total !== null ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                <span>{job.progress.processed} / {job.progress.total}</span>
                <span>{job.progress.percentage ?? '—'}%</span>
              </div>
              <div style={{ height: 10, background: 'var(--card-border)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, job.progress.percentage ?? 0)}%`,
                    background: job.status === 'FAILED' ? 'var(--error-text)' : job.status === 'COMPLETED' ? '#16a34a' : 'var(--link)',
                    transition: 'width 0.5s',
                  }}
                />
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Total estimate unavailable — processed {job.progress.processed} (indeterminate)</div>
          )}
          <div>counters: <span title="succeeded: cover found+persisted alias">succeeded {job.counters.succeeded}</span> · <span title="found">found {job.counters.found}</span> · <span title="persisted: written to DB">persisted {job.counters.persisted}</span> · <span title="unchanged: already had cover">unchanged {job.counters.unchanged}</span> · <span title="failed: errors" style={{ color: job.counters.failed ? 'var(--error-text)' : undefined }}>failed {job.counters.failed}</span></div>
          <div>rate: {formatRate(job.progress.itemsPerSecond)} — ETA: {formatEtaPrecise(job.progress.etaSeconds)}</div>
          <div title="Last domainId of a fully committed batch — resume continues from domainId > cursor">
            cursor: <code style={{ fontSize: 12, background: 'var(--bg-soft)', padding: '2px 6px', borderRadius: 4 }}>{job.cursor || '(start)'}</code> {job.cursor && <span style={{ color: 'var(--text-secondary)' }}>(committed horizon)</span>}
          </div>
        </Card>

        <Card title="Owner / Lease">
          <LeaseHealthBadge health={leaseHealth} />
          <div>owner: <code style={{ fontSize: 12 }}>{job.owner.id ?? '—'}</code></div>
          <div title={job.owner.leaseExpiresAt ?? undefined}>lease: {job.owner.leaseRemainingMs !== null ? `${Math.round(job.owner.leaseRemainingMs / 1000)}s remaining` : '—'} {job.owner.leaseExpiresAt && <span style={{ color: 'var(--text-secondary)' }}> (expires {new Date(job.owner.leaseExpiresAt).toLocaleTimeString()})</span>}</div>
          <div title={job.owner.lastHeartbeatAt ?? undefined}>last heartbeat: {job.owner.lastHeartbeatAt ? `${formatTimeAgo(job.owner.lastHeartbeatAt)} (${new Date(job.owner.lastHeartbeatAt).toLocaleString()})` : '—'}</div>
          <div title={job.timing.lastActivityAt}>last activity: {formatTimeAgo(job.timing.lastActivityAt)} <span style={{ color: 'var(--text-secondary)' }}>({new Date(job.timing.lastActivityAt).toLocaleString()})</span></div>
        </Card>

        <Card title="Timing">
          <div>startedAt: {job.timing.startedAt ? new Date(job.timing.startedAt).toLocaleString() : '—'}</div>
          <div>pausedAt: {job.timing.pausedAt ? new Date(job.timing.pausedAt).toLocaleString() : '—'}</div>
          <div>completedAt: {job.timing.completedAt ? new Date(job.timing.completedAt).toLocaleString() : '—'}</div>
          <div>lastActivityAt: {job.timing.lastActivityAt}</div>
          <div>updatedAt: {job.timing.updatedAt}</div>
          <div>createdAt: {job.timing.createdAt}</div>
        </Card>
      </div>
    </div>
  );
}

function LeaseHealthBadge({ health }: { health: string }) {
  const color = health === 'Healthy' ? '#16a34a' : health === 'Expiring' ? '#f59e0b' : health === 'Expired' ? 'var(--error-text)' : 'var(--text-secondary)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ fontWeight: 600, fontSize: 13, color }}>Lease: {health}</span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>(Healthy &gt;10s, Expiring ≤10s, Expired ≤0)</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, padding: 16 }}>
      <h3 style={{ fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}
const btn: React.CSSProperties = { padding: '8px 14px', color: 'var(--card-bg)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
