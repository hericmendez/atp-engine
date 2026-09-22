import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { Loading, ErrorBox, Empty } from '../components/Layout';
import { Pagination } from '../components/Pagination';
import { PageSizeSelector } from '../components/PageSizeSelector';
import { SortableHeader } from '../components/SortableHeader';

type HistoryEntry = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  trigger: string;
  status: string;
  dryRun: boolean;
  from: string;
  to: string;
  requestedPlatformIds: string[];
  resolvedPlatformNames: string[];
  totals: { candidatesFound: number; newGames: number; existingGames: number; updatedGames: number; rejected: number; errors: number };
  platformResults: { platformId: string; platformName: string; candidatesFound: number; newGames: number; existingGames: number; updatedGames: number; rejected: number; errors: number; status: string; error: string | null }[];
  error: string | null;
  durationMs: number | null;
};

function getParam(params: URLSearchParams, key: string, fallback: string) {
  return params.get(key) ?? fallback;
}

function defaultDates(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function CatalogSync() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<HistoryEntry[]>([]);
  const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);

  // Trigger modal state
  const [showModal, setShowModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(() => defaultDates().from);
  const [toDate, setToDate] = useState(() => defaultDates().to);
  const [dryRun, setDryRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [triggerError, setTriggerError] = useState<ApiClientError | null>(null);
  const [triggerResult, setTriggerResult] = useState<{ dryRun: boolean; data: { historyId?: string; status: string; totals: HistoryEntry['totals']; durationMs: number | null } } | null>(null);
  const [platformOptions, setPlatformOptions] = useState<{ id: string; name: string }[]>([]);
  const [confirming, setConfirming] = useState(false);

  const page = parseInt(getParam(searchParams, 'page', '1'), 10) || 1;
  const limit = parseInt(getParam(searchParams, 'limit', '20'), 10) || 20;
  const status = getParam(searchParams, 'status', '');
  const trigger = getParam(searchParams, 'trigger', '');
  const platformId = getParam(searchParams, 'platformId', '');
  const sort = getParam(searchParams, 'sort', 'startedAt');
  const order = getParam(searchParams, 'order', 'desc');

  const hasActiveFilters = Boolean(status || trigger || platformId);

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
    else { next.set('sort', field); next.set('order', field === 'startedAt' ? 'desc' : 'asc'); }
    next.set('page', '1');
    setSearchParams(next);
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams(searchParams);
        if (!params.has('limit')) params.set('limit', '20');
        if (!params.has('page')) params.set('page', '1');
        const res = await api.get<{ data: HistoryEntry[]; pagination: typeof pagination }>(`/api/v1/catalog/sync/history?${params.toString()}`);
        setData(res.data);
        setPagination(res.pagination);
        setLoading(false);
      } catch (e) {
        setError(e as ApiClientError);
        setLoading(false);
      }
    };
    fetchData();
  }, [searchParams]);

  useEffect(() => {
    if (showAdvanced && platformOptions.length === 0) {
      api
        .get<{ data: { id: string; name: string }[] }>(`/api/v1/platforms/summary?limit=100`)
        .then((res) => setPlatformOptions(res.data.map((p) => ({ id: p.id, name: p.name }))))
        .catch(() => {});
    }
  }, [showAdvanced, platformOptions.length]);

  const openModal = () => {
    setTriggerError(null);
    setTriggerResult(null);
    setConfirming(false);
    const d = defaultDates();
    setFromDate(d.from);
    setToDate(d.to);
    setDryRun(false);
    setActiveOnly(true);
    setSelectedPlatforms([]);
    setShowAdvanced(false);
    setShowModal(true);
  };

  const handleStart = async () => {
    if (submitting) return;
    // validation
    if (!activeOnly && selectedPlatforms.length === 0) {
      setTriggerError(new ApiClientError('VALIDATION_ERROR', 'Select at least one platform or use Active only', 400));
      return;
    }
    if (fromDate > toDate) {
      setTriggerError(new ApiClientError('VALIDATION_ERROR', 'From date must be before or equal to To date', 400));
      return;
    }
    if (!dryRun) {
      if (!confirming) {
        setConfirming(true);
        return;
      }
    }
    setSubmitting(true);
    setTriggerError(null);
    try {
      const body: Record<string, unknown> = { from: fromDate, to: toDate, dryRun };
      if (activeOnly) body.activeOnly = true;
      else body.platforms = selectedPlatforms;
      const res = await api.post<{ data: { historyId?: string; status: string; totals: HistoryEntry['totals']; durationMs: number | null; dryRun: boolean } }>(
        '/api/v1/admin/catalog/sync',
        body,
      );
      const data = res.data;
      if (dryRun) {
        setTriggerResult({ dryRun: true, data });
        setSubmitting(false);
        setConfirming(false);
      } else {
        setSubmitting(false);
        setShowModal(false);
        if (data.historyId) {
          navigate(`/admin/catalog-sync/${encodeURIComponent(data.historyId)}`);
        } else {
          // fallback refresh list
          setTriggerResult({ dryRun: false, data });
        }
      }
    } catch (e) {
      const err = e as ApiClientError;
      setTriggerError(err);
      setSubmitting(false);
      setConfirming(false);
    }
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams({ page: '1', limit: '20', sort: 'startedAt', order: 'desc' }));
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Catalog Sync History</h2>
        <button onClick={openModal} style={{ ...btn, background: 'var(--link)' }}>Start Sync</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>History is read-only. Use dryRun for safe validation.</p>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => !submitting && setShowModal(false)}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 8, padding: 20, minWidth: 420, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 700, marginBottom: 4 }}>{dryRun ? 'Dry Run Preview' : 'Start Catalog Sync?'}</h3>
            {!confirming || dryRun ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                {dryRun ? 'This will simulate sync without writing to the catalog.' : 'This will discover games for the selected platforms and may write to the catalog.'}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: '#92400e', background: '#fef3c7', padding: 8, borderRadius: 6, marginBottom: 12 }}>
                Start synchronization? This is a heavy operation.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} disabled={submitting} /> Active only
              </label>
              {!activeOnly && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Platforms (at least one required)</div>
                  <div style={{ maxHeight: 120, overflow: 'auto', border: '1px solid var(--card-border)', borderRadius: 6, padding: 8 }}>
                    {platformOptions.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading platforms…</div> : platformOptions.map((p) => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 0' }}>
                        <input type="checkbox" checked={selectedPlatforms.includes(p.id)} disabled={submitting} onChange={(e) => setSelectedPlatforms((prev) => e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id))} /> {p.name} <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{p.id}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ fontSize: 13 }}>From <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} disabled={submitting} style={inp} /></label>
                <label style={{ fontSize: 13 }}>To <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} disabled={submitting} style={inp} /></label>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} disabled={submitting} /> Dry run
              </label>
              <button onClick={() => setShowAdvanced((v) => !v)} style={{ fontSize: 12, color: 'var(--link)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>{showAdvanced ? 'Hide advanced' : 'Advanced options'}</button>
            </div>

            {triggerError && (
              <div style={{ marginBottom: 12 }}>
                <ErrorBox message={triggerError.message} requestId={triggerError.requestId} />
                {triggerError.status === 409 && <div style={{ marginTop: 8 }}><Link to="/admin/catalog-sync?status=running" style={{ fontSize: 13, color: 'var(--link)' }} onClick={() => setShowModal(false)}>View running syncs →</Link></div>}
              </div>
            )}
            {triggerResult?.dryRun && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: '#166534' }}>DRY RUN — not persisted</div>
                <div>Status: {triggerResult.data.status}</div>
                <div>Candidates: {triggerResult.data.totals.candidatesFound} — New: {triggerResult.data.totals.newGames} — Rejected: {triggerResult.data.totals.rejected}</div>
                <div>Duration: {triggerResult.data.durationMs !== null ? `${Math.round(triggerResult.data.durationMs / 1000)}s` : '—'}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => !submitting && setShowModal(false)} disabled={submitting} style={btnSecondary}>Cancel</button>
              <button onClick={handleStart} disabled={submitting} style={{ ...btn, opacity: submitting ? 0.6 : 1, background: dryRun ? 'var(--text-primary)' : 'var(--link)' }}>{submitting ? 'Starting…' : confirming && !dryRun ? 'Confirm Start' : dryRun ? 'Preview' : 'Start'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', background: 'var(--card-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--card-border)' }}>
        <select value={status} onChange={(e) => updateParams({ status: e.target.value || undefined })} style={inp}>
          <option value="">status: all</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
          <option value="partial">partial</option>
          <option value="failed">failed</option>
        </select>
        <select value={trigger} onChange={(e) => updateParams({ trigger: e.target.value || undefined })} style={inp}>
          <option value="">trigger: all</option>
          <option value="manual">manual</option>
          <option value="scheduled">scheduled</option>
        </select>
        <input placeholder="platformId" value={platformId} onChange={(e) => updateParams({ platformId: e.target.value || undefined })} style={inp} />
        <select value={sort} onChange={(e) => updateParams({ sort: e.target.value || undefined, order }, true)} style={inp}>
          <option value="startedAt">startedAt</option>
          <option value="completedAt">completedAt</option>
          <option value="status">status</option>
          <option value="trigger">trigger</option>
        </select>
        <select value={order} onChange={(e) => updateParams({ order: e.target.value || undefined }, false)} style={inp}>
          <option value="desc">desc</option>
          <option value="asc">asc</option>
        </select>
        <button onClick={clearFilters} style={btnSecondary}>Clear filters</button>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error.message} requestId={error.requestId} />}
      {!loading && !error && data.length === 0 && <Empty message={hasActiveFilters ? 'No catalog syncs match the selected filters.' : 'No catalog sync history.'} />}
      {!loading && !error && data.length > 0 && (
        <>
          <table style={table}>
            <thead>
              <tr>
                <SortableHeader field="startedAt" label="started" sort={sort} order={order} onSort={handleSort} />
                <SortableHeader field="status" label="status" sort={sort} order={order} onSort={handleSort} />
                <SortableHeader field="trigger" label="trigger" sort={sort} order={order} onSort={handleSort} />
                <th style={th}>dryRun</th>
                <th style={th}>platforms</th>
                <th style={th}>candidates</th>
                <th style={th}>new</th>
                <th style={th}>existing</th>
                <th style={th}>updated</th>
                <th style={th}>rejected</th>
                <th style={th}>errors</th>
                <th style={th}>duration</th>
              </tr>
            </thead>
            <tbody>
              {data.map((h) => (
                <tr key={h.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}><Link to={`/admin/catalog-sync/${encodeURIComponent(h.id)}`} style={{ color: 'var(--link)' }}>{new Date(h.startedAt).toLocaleString()}</Link></td>
                  <td style={td}><span style={badgeStyle(h.status)}>{h.status}</span></td>
                  <td style={td}>{h.trigger}</td>
                  <td style={td}>{h.dryRun ? 'yes' : 'no'}</td>
                  <td style={td}>{h.requestedPlatformIds.join(', ') || '—'} {h.resolvedPlatformNames.length ? `→ ${h.resolvedPlatformNames.join(', ')}` : ''}</td>
                  <td style={td}>{h.totals.candidatesFound}</td>
                  <td style={td}>{h.totals.newGames}</td>
                  <td style={td}>{h.totals.existingGames}</td>
                  <td style={td}>{h.totals.updatedGames}</td>
                  <td style={td}>{h.totals.rejected}</td>
                  <td style={td}>{h.totals.errors}</td>
                  <td style={td}>{h.durationMs !== null ? `${Math.round(h.durationMs / 1000)}s` : '—'}</td>
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

function badgeStyle(status: string): React.CSSProperties {
  const map: Record<string, string> = { running: 'var(--link)', completed: '#16a34a', partial: '#f59e0b', failed: 'var(--error-text)' };
  return { background: map[status] ?? 'var(--text-secondary)', color: 'var(--card-bg)', padding: '2px 6px', borderRadius: 12, fontSize: 11, fontWeight: 700 };
}
const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid var(--input-border)', borderRadius: 6, fontSize: 13 };
const btn: React.CSSProperties = { padding: '6px 10px', background: 'var(--text-primary)', color: 'var(--card-bg)', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { ...btn, background: 'var(--text-secondary)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: 'var(--card-bg)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', background: 'var(--bg-soft)', fontSize: 12, borderBottom: '1px solid var(--card-border)' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--bg-soft)', verticalAlign: 'top' };
