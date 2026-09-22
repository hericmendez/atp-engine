import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
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

  // Start Enrichment modal state
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [limitInput, setLimitInput] = useState('100');
  const [batchInput, setBatchInput] = useState('50');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<ApiClientError | null>(null);
  const limitRef = useRef<HTMLInputElement>(null);
  const startBtnRef = useRef<HTMLButtonElement>(null);

  const openModal = () => {
    setLimitInput('100');
    setBatchInput('50');
    setShowAdvanced(false);
    setCreateError(null);
    setShowModal(true);
    setTimeout(() => limitRef.current?.focus(), 0);
  };
  const closeModal = () => {
    if (createLoading) return;
    setShowModal(false);
    setCreateError(null);
    setTimeout(() => startBtnRef.current?.focus(), 0);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createLoading) return;
    // client validation
    const limitTrim = limitInput.trim();
    let limitVal: number | undefined;
    if (limitTrim !== '') {
      const n = Number(limitTrim);
      if (!Number.isInteger(n) || n < 1) {
        setCreateError(new ApiClientError('VALIDATION_ERROR', 'Limit must be a positive integer', 400) as ApiClientError);
        return;
      }
      limitVal = n;
    }
    const batchTrim = batchInput.trim();
    const batchNum = Number(batchTrim);
    if (batchTrim === '' || !Number.isInteger(batchNum) || batchNum < 1 || batchNum > 100) {
      setCreateError(new ApiClientError('VALIDATION_ERROR', 'Batch size must be an integer between 1 and 100', 400) as ApiClientError);
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const payload: Record<string, unknown> = { type: 'cover', batchSize: batchNum };
      if (limitVal !== undefined) payload.limit = limitVal;
      const res = await api.post<{ data: EnrichmentJobDto }>('/api/v1/admin/enrichment/jobs', payload);
      setCreateLoading(false);
      setShowModal(false);
      navigate(`/admin/enrichment/${encodeURIComponent(res.data.id)}`);
    } catch (err) {
      setCreateError(err as ApiClientError);
      setCreateLoading(false);
    }
  };

  useEffect(() => {
    if (!showModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal, createLoading]);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Enrichment Jobs</h2>
        <button
          ref={startBtnRef}
          onClick={openModal}
          style={{ marginLeft: 'auto', padding: '8px 14px', background: 'var(--text-primary)', color: 'var(--card-bg)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          Start Enrichment
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, background: 'var(--card-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--card-border)', flexWrap: 'wrap' }}>
        <select value={type} onChange={(e) => updateParams({ type: e.target.value || undefined })} style={inp}><option value="">type: all</option><option value="cover">cover</option><option value="company">company</option></select>
        <select value={status} onChange={(e) => updateParams({ status: e.target.value || undefined })} style={inp}><option value="">status: all</option><option value="PENDING">PENDING</option><option value="RUNNING">RUNNING</option><option value="PAUSING">PAUSING</option><option value="PAUSED">PAUSED</option><option value="FAILED">FAILED</option><option value="COMPLETED">COMPLETED</option><option value="CANCELLED">CANCELLED</option></select>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error.message} requestId={error.requestId} />}
      {!loading && !error && jobs.length === 0 && (
        <div>
          <Empty message={emptyMessage} />
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={openModal} style={{ padding: '8px 14px', background: 'var(--text-primary)', color: 'var(--card-bg)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
              Start Enrichment
            </button>
          </div>
        </div>
      )}
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
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrich-start-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') closeModal(); }}
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, padding: 24, minWidth: 400, maxWidth: 480, width: '90%', color: 'var(--text-primary)' }}
          >
            <h3 id="enrich-start-title" style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Start Enrichment</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Type
                <input value="Cover" readOnly disabled style={{ ...inp, background: 'var(--bg-soft)', color: 'var(--text-secondary)' }} aria-label="Type" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                Limit
                <input
                  ref={limitRef}
                  value={limitInput}
                  onChange={(e) => setLimitInput(e.target.value)}
                  placeholder="100"
                  inputMode="numeric"
                  style={inp}
                  aria-label="Limit"
                />
              </label>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Leave empty to process all candidates. Large jobs may take several hours.</div>
              <details open={showAdvanced} onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)} style={{ fontSize: 13 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--link)', fontWeight: 600 }}>Advanced options</summary>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, marginTop: 8 }}>
                  Batch size
                  <input
                    value={batchInput}
                    onChange={(e) => setBatchInput(e.target.value)}
                    placeholder="50"
                    inputMode="numeric"
                    style={inp}
                    aria-label="Batch size"
                  />
                </label>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>1–100</div>
              </details>
              {createError && (
                <div role="alert" style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: 10, color: 'var(--error-text)', fontSize: 13 }}>
                  {createError.code === 'CONFLICT' ? 'An enrichment job is already active.' : createError.message}
                  {createError.code === 'CONFLICT' && <div style={{ marginTop: 6 }}><Link to="/admin/enrichment" onClick={closeModal} style={{ color: 'var(--link)', fontSize: 12 }}>View existing jobs</Link></div>}
                  {createError.requestId && <div style={{ fontSize: 11, marginTop: 4 }}>requestId: {createError.requestId}</div>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={closeModal} disabled={createLoading} style={{ ...btnSecondary, opacity: createLoading ? 0.6 : 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={createLoading} style={{ ...btn, opacity: createLoading ? 0.6 : 1 }}>
                  {createLoading ? 'Creating...' : 'Start'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid var(--input-border)', borderRadius: 6, fontSize: 13 };
const btn: React.CSSProperties = { padding: '8px 14px', background: 'var(--text-primary)', color: 'var(--card-bg)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', background: 'var(--bg-soft)', color: 'var(--text-primary)', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: 'var(--card-bg)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', background: 'var(--bg-soft)', fontSize: 12, borderBottom: '1px solid var(--card-border)' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--bg-soft)' };
