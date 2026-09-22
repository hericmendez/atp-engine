import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import type { EnrichmentJobDto } from '../api/types';
import { Loading, ErrorBox } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { formatRate, formatEtaPrecise, formatTimeAgo, formatBytes } from '../lib/format';

function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, active: boolean, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      try {
        const res = await fetcher();
        if (!cancelled) {
          setData(res);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e as ApiClientError);
          setLoading(false);
        }
      }
    };

    run();
    if (active) {
      timer = setInterval(run, intervalMs);
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, intervalMs, ...deps]);

  return { data, error, loading };
}

export function Overview() {
  const [metrics, setMetrics] = useState<{ total: number; withCover: number; withDescription: number; withDevelopers: number; withPublishers: number } | null>(null);
  const [metricsError, setMetricsError] = useState<ApiClientError | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const base = '/api/v1/admin/games?limit=1';
        const [all, cover, desc, dev, pub] = await Promise.all([
          api.get<{ pagination: { total: number } }>(base),
          api.get<{ pagination: { total: number } }>(`${base}&hasCover=true`),
          api.get<{ pagination: { total: number } }>(`${base}&hasDescription=true`),
          api.get<{ pagination: { total: number } }>(`${base}&hasDevelopers=true`),
          api.get<{ pagination: { total: number } }>(`${base}&hasPublishers=true`),
        ]);
        if (!cancelled) {
          setMetrics({
            total: all.pagination.total,
            withCover: cover.pagination.total,
            withDescription: desc.pagination.total,
            withDevelopers: dev.pagination.total,
            withPublishers: pub.pagination.total,
          });
          setMetricsLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setMetricsError(e as ApiClientError);
          setMetricsLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetcher = () => api.get<{ data: EnrichmentJobDto[] }>('/api/v1/admin/enrichment/jobs?limit=5');
  const [jobsData, setJobsData] = useState<EnrichmentJobDto[] | null>(null);
  const { data: jobsRes, error: jobsError, loading: jobsLoading } = usePolling(fetcher, 5000, true, []);

  useEffect(() => {
    if (jobsRes) setJobsData(jobsRes.data);
  }, [jobsRes]);

  const activeJob = jobsData?.find((j) => ['RUNNING', 'PAUSING', 'PENDING'].includes(j.status));

  // Only poll detail when activeJob exists — avoid fetch(null)
  const { data: activeDetail } = usePolling(
    () => api.get<{ data: EnrichmentJobDto }>(`/api/v1/admin/enrichment/jobs/${encodeURIComponent(activeJob!.id)}`),
    5000,
    !!activeJob,
    [activeJob?.id],
  );

  const displayJob = activeDetail?.data ?? activeJob ?? null;

  const pct = (v: number | null, total: number | null) => {
    if (total === null || total === 0 || v === null) return null;
    return Math.round((v / total) * 1000) / 10;
  };

  type DatabaseStats = {
    dataSize: number;
    storageSize: number;
    indexSize: number;
    totalSize: number;
    objects: number;
    collections: number;
    avgObjSize: number;
    collectionsStats: readonly { name: string; count: number; size: number; storageSize: number; totalIndexSize: number }[];
  };
  const dbFetcher = () => api.get<{ data: DatabaseStats }>('/api/v1/admin/database/stats');
  const { data: dbRes, error: dbError, loading: dbLoading } = usePolling(dbFetcher, 30000, true, []);
  const dbStats = dbRes?.data && typeof dbRes.data === 'object' && !Array.isArray(dbRes.data) && 'dataSize' in dbRes.data ? (dbRes.data as DatabaseStats) : null;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Overview</h2>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Catalog — coverage</h3>
        {metricsLoading && <Loading />}
        {metricsError && <ErrorBox message={metricsError.message} requestId={metricsError.requestId} />}
        {metrics && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
            <CardLink to="/admin/games" label="Total games" value={metrics.total} sub={undefined} />
            <CardLink to="/admin/games?hasCover=true" label="With cover" value={metrics.withCover} sub={pct(metrics.withCover, metrics.total)} />
            <CardLink to="/admin/games?hasDescription=true" label="With description" value={metrics.withDescription} sub={pct(metrics.withDescription, metrics.total)} />
            <CardLink to="/admin/games?hasDevelopers=true" label="With developers" value={metrics.withDevelopers} sub={pct(metrics.withDevelopers, metrics.total)} />
            <CardLink to="/admin/games?hasPublishers=true" label="With publishers" value={metrics.withPublishers} sub={pct(metrics.withPublishers, metrics.total)} />
          </div>
        )}
        {metrics && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
            Click a card to investigate in Games. Percentages frontend-only: withX / total. Without cover ≈ {metrics.total - metrics.withCover} (hasCover=false).
          </div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Database — storage</h3>
        {dbLoading && <Loading />}
        {dbError && <ErrorBox message={dbError.message} requestId={dbError.requestId} />}
        {dbStats && (
          <div style={{ border: '1px solid var(--card-border)', borderRadius: 8, padding: 16, background: 'var(--card-bg)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Data</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{formatBytes(dbStats.dataSize)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Data</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, fontSize: 13 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Allocated</div>
                <div style={{ fontWeight: 600 }}>{formatBytes(dbStats.storageSize)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Indexes</div>
                <div style={{ fontWeight: 600 }}>{formatBytes(dbStats.indexSize)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Documents</div>
                <div style={{ fontWeight: 600 }}>{dbStats.objects.toLocaleString()}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span>Total logical: {formatBytes(dbStats.totalSize)}</span>
              <span>Collections: {dbStats.collections}</span>
              <span>Updated: {formatTimeAgo(new Date().toISOString())}</span>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Enrichment — recent jobs</h3>
        {jobsLoading && <Loading />}
        {jobsError && <ErrorBox message={jobsError.message} requestId={jobsError.requestId} />}
        {jobsData && jobsData.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>No jobs</div>}
        {displayJob && (
          <div style={{ border: '1px solid var(--card-border)', borderRadius: 8, padding: 16, background: 'var(--card-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{displayJob.type} —</span> <StatusBadge status={displayJob.status} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }} title={displayJob.timing.lastActivityAt}>last activity {formatTimeAgo(displayJob.timing.lastActivityAt)}</span>
              <Link to={`/admin/enrichment/${encodeURIComponent(displayJob.id)}`} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--link)' }}>Open →</Link>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{displayJob.message}</div>
            {displayJob.progress.total !== null && (
              <div style={{ height: 8, background: 'var(--progress-bg)', borderRadius: 6, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ height: '100%', width: `${Math.min(100, displayJob.progress.percentage ?? 0)}%`, background: 'var(--progress-fill)', transition: 'width 0.5s' }} />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12, fontSize: 13 }}>
              <div title="processed / total">processed: {displayJob.progress.processed} / {displayJob.progress.total ?? '—'} ({displayJob.progress.percentage ?? '—'}%)</div>
              <div>rate: {formatRate(displayJob.progress.itemsPerSecond)}</div>
              <div>ETA: {formatEtaPrecise(displayJob.progress.etaSeconds)}</div>
              <div title="found/persisted/unchanged/failed/succeeded">found: {displayJob.counters.found} persisted: {displayJob.counters.persisted} unchanged:{displayJob.counters.unchanged} failed:{displayJob.counters.failed} succeeded:{displayJob.counters.succeeded}</div>
              <div title="committed horizon — resume continues from domainId > cursor">cursor: {displayJob.cursor || '(start)'}</div>
              <div title={displayJob.timing.lastActivityAt}>lastActivity: {formatTimeAgo(displayJob.timing.lastActivityAt)}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>processed = persisted + unchanged + failed (operational semantics)</div>
            {displayJob.error && <div style={{ marginTop: 8, color: 'var(--error-text)', fontSize: 13 }}>error: {displayJob.error}</div>}
          </div>
        )}
        {jobsData && (
          <ul style={{ marginTop: 12 }}>
            {jobsData.map((j) => (
              <li key={j.id} style={{ fontSize: 13, borderBottom: '1px solid var(--card-border)', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'monospace' }}>{j.id}</span> — {j.type}/{j.mode} — <StatusBadge status={j.status} /> — {j.progress.processed}/{j.progress.total ?? '?'} ({j.progress.percentage ?? '?'}%)
                <Link to={`/admin/enrichment/${encodeURIComponent(j.id)}`} style={{ marginLeft: 'auto', color: 'var(--link)', fontSize: 12 }}>detail →</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CardLink({ label, value, sub, to }: { label: string; value: number; sub: number | null | undefined; to: string }) {
  return (
    <Link to={to} style={{ textDecoration: 'none', border: '1px solid var(--card-border)', borderRadius: 8, padding: 16, background: 'var(--card-bg)', display: 'block' }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{value.toLocaleString()}</div>
      {sub !== undefined && sub !== null && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}% coverage</div>}
    </Link>
  );
}
