import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import type { EnrichmentJobDto } from '../api/types';
import { Loading, ErrorBox, Empty } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { formatRate, formatEtaPrecise } from '../lib/format';
import { Pagination } from '../components/Pagination';
import { PageSizeSelector } from '../components/PageSizeSelector';
import { SortableHeader } from '../components/SortableHeader';

function getParam(params: URLSearchParams, key: string, fallback: string) {
  return params.get(key) ?? fallback;
}

export function Enrichment() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState<EnrichmentJobDto[]>([]);
  const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);

  const page = parseInt(getParam(searchParams, 'page', '1'), 10) || 1;
  const limit = parseInt(getParam(searchParams, 'limit', '20'), 10) || 20;
  const sort = getParam(searchParams, 'sort', 'updatedAt');
  const order = getParam(searchParams, 'order', 'desc');
  const type = getParam(searchParams, 'type', '');
  const status = getParam(searchParams, 'status', '');

  const hasActiveFilters = Boolean(type || status);

  const updateParams = (updates: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.set('page', '1');
    setSearchParams(next);
  };

  const setPage = (p: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  };

  const handleSort = (field: string) => {
    const next = new URLSearchParams(searchParams);
    if (sort === field) next.set('order', order === 'asc' ? 'desc' : 'asc');
    else { next.set('sort', field); next.set('order', 'desc'); }
    next.set('page', '1');
    setSearchParams(next);
  };

  const fetchJobs = async () => {
    try {
      const params = new URLSearchParams(searchParams);
      if (!params.has('limit')) params.set('limit', '20');
      if (!params.has('page')) params.set('page', '1');
      if (!params.has('sort')) { params.set('sort', 'updatedAt'); params.set('order', 'desc'); }
      const res = await api.get<{ data: EnrichmentJobDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/api/v1/admin/enrichment/jobs?${params.toString()}`);
      // Backward compat: if pagination missing (old limit-only), synthesize
      if ((res as unknown as { pagination?: unknown }).pagination) {
        setJobs(res.data);
        setPagination((res as unknown as { pagination: typeof pagination }).pagination);
      } else {
        const legacy = res as unknown as { data: EnrichmentJobDto[] };
        setJobs(legacy.data);
        setPagination({ page: 1, limit: legacy.data.length, total: legacy.data.length, totalPages: 1 });
      }
      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e as ApiClientError);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const timer = setInterval(fetchJobs, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const emptyMessage = (() => {
    if (type && status) return `No ${status.toLowerCase()} ${type} enrichment jobs found.`;
    if (type) return `No ${type} enrichment jobs found.`;
    if (status) return `No ${status.toLowerCase()} enrichment jobs found.`;
    return 'No enrichment jobs exist.';
  })();

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Enrichment Jobs</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, background: 'var(--card-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--card-border)', flexWrap: 'wrap' }}>
        <select value={type} onChange={(e) => updateParams({ type: e.target.value || undefined })} style={inp}><option value="">type: all</option><option value="cover">cover</option><option value="company">company</option></select>
        <select value={status} onChange={(e) => updateParams({ status: e.target.value || undefined })} style={inp}><option value="">status: all</option><option value="PENDING">PENDING</option><option value="RUNNING">RUNNING</option><option value="PAUSING">PAUSING</option><option value="PAUSED">PAUSED</option><option value="FAILED">FAILED</option><option value="COMPLETED">COMPLETED</option><option value="CANCELLED">CANCELLED</option></select>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error.message} requestId={error.requestId} />}
      {!loading && !error && jobs.length === 0 && <Empty message={emptyMessage} />}
      {!loading && !error && jobs.length > 0 && (
        <>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>type</th>
                <th style={th}>mode</th>
                <SortableHeader field="status" label="status" sort={sort} order={order} onSort={handleSort} />
                <th style={th}>progress</th>
                <th style={th}>throughput / ETA</th>
                <th style={th}>counters</th>
                <th style={th}>cursor</th>
                <SortableHeader field="startedAt" label="started" sort={sort} order={order} onSort={handleSort} />
                <SortableHeader field="updatedAt" label="lastActivity" sort={sort} order={order} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}><Link to={`/admin/enrichment/${encodeURIComponent(j.id)}`} style={{ color: 'var(--link)' }}>{j.id}</Link></td>
                  <td style={td}>{j.type}</td><td style={td}>{j.mode}</td><td style={td}><StatusBadge status={j.status} /></td>
                  <td style={td} title={j.progress.total ? `${j.progress.processed}/${j.progress.total}` : `${j.progress.processed} (no estimate)`}>{j.progress.processed}/{j.progress.total ?? '?'} ({j.progress.percentage ?? '—'}%)</td>
                  <td style={td} title="itemsPerSecond / etaSeconds">{formatRate(j.progress.itemsPerSecond)} / {formatEtaPrecise(j.progress.etaSeconds)}</td>
                  <td style={td} title="succeeded: covers found, found: discovered, persisted: written to DB, unchanged: already had cover, failed: errors">
                    <span title="succeeded">{j.counters.succeeded} suc</span> · <span title="found">{j.counters.found} found</span> · <span title="persisted">{j.counters.persisted} per</span> · <span title="unchanged">{j.counters.unchanged} unch</span> · <span title="failed" style={{ color: j.counters.failed ? 'var(--error-text)' : undefined }}>{j.counters.failed} fail</span>
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }} title={j.cursor || '(start)'}>{j.cursor ? `${j.cursor.slice(0, 16)}…` : '(start)'}</td>
                  <td style={td}>{j.timing.startedAt ? new Date(j.timing.startedAt).toLocaleString() : '—'}</td>
                  <td style={td}>{new Date(j.timing.lastActivityAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagination && (
            <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Pagination page={pagination.page} totalPages={pagination.totalPages} onPage={setPage} />
              <span>total {pagination.total}</span>
              <PageSizeSelector value={pagination.limit} onChange={(v) => { const next = new URLSearchParams(searchParams); next.set('limit', String(v)); next.set('page','1'); setSearchParams(next); }} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid var(--input-border)', borderRadius: 6, fontSize: 13 };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: 'var(--card-bg)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', background: 'var(--bg-soft)', fontSize: 12, borderBottom: '1px solid var(--card-border)' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--bg-soft)' };
