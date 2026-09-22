import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import type { PlatformDto } from '../api/types';
import { Loading, ErrorBox, Empty } from '../components/Layout';
import { Pagination } from '../components/Pagination';
import { PageSizeSelector } from '../components/PageSizeSelector';
import { SortableHeader } from '../components/SortableHeader';

function getParam(params: URLSearchParams, key: string, fallback: string) {
  return params.get(key) ?? fallback;
}

export function Platforms() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PlatformDto[]>([]);
  const [pagination, setPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [exporting, setExporting] = useState<Record<string, 'csv' | 'json' | null>>({});
  const [exportError, setExportError] = useState<ApiClientError | null>(null);

  const page = parseInt(getParam(searchParams, 'page', '1'), 10) || 1;
  const limit = parseInt(getParam(searchParams, 'limit', '20'), 10) || 20;
  const sort = getParam(searchParams, 'sort', 'name');
  const order = getParam(searchParams, 'order', 'asc');
  const showEmpty = getParam(searchParams, 'showEmptyPlatforms', 'false');
  const companyName = getParam(searchParams, 'companyName', '');
  const platformStatus = getParam(searchParams, 'platformStatus', '');
  const releaseYear = getParam(searchParams, 'releaseYear', '');

  const hasActiveFilters = Array.from(searchParams.entries()).some(([k, v]) => v && !['page', 'limit', 'sort', 'order'].includes(k));

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
    else { next.set('sort', field); next.set('order', field === 'name' ? 'asc' : 'desc'); }
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
        if (!params.has('sort')) {
          params.set('sort', 'name');
          params.set('order', 'asc');
        }
        const res = await api.get<{ data: PlatformDto[]; pagination: typeof pagination; origin: string }>(`/api/v1/platforms/summary?${params.toString()}`);
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

  const clearFilters = () => {
    setSearchParams(new URLSearchParams({ sort: 'name', order: 'asc', showEmptyPlatforms: 'false', page: '1', limit: '20' }));
  };

  const handleExport = async (platform: PlatformDto, format: 'csv' | 'json') => {
    const key = `${platform.id}:${format}`;
    setExporting((prev) => ({ ...prev, [key]: format }));
    setExportError(null);
    try {
      const { blob, filename } = await api.getBlob(`/api/v1/platforms/${encodeURIComponent(platform.name)}/games/export?format=${format}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename ?? `atp-${platform.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-games.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e as ApiClientError);
    } finally {
      setExporting((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Platforms</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', background: 'var(--card-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--card-border)' }}>
        <input placeholder="company" value={companyName} onChange={(e) => updateParams({ companyName: e.target.value || undefined })} style={inp} />
        <select value={platformStatus} onChange={(e) => updateParams({ platformStatus: e.target.value || undefined })} style={inp}>
          <option value="">status: all</option>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="discontinued">discontinued</option>
        </select>
        <input placeholder="releaseYear" value={releaseYear} onChange={(e) => updateParams({ releaseYear: e.target.value || undefined })} style={{ ...inp, width: 120 }} type="number" />
        <select value={showEmpty} onChange={(e) => updateParams({ showEmptyPlatforms: e.target.value || undefined })} style={inp}><option value="false">hide empty</option><option value="true">show empty</option></select>
        <button onClick={clearFilters} style={btnSecondary}>Clear filters</button>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', alignSelf: 'center' }} title="Game count from catalog releases (releases, not distinct games)">Game count from catalog releases</span>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error.message} requestId={error.requestId} />}
      {exportError && <ErrorBox message={exportError.message} requestId={exportError.requestId} />}
      {!loading && !error && data.length === 0 && <Empty message={hasActiveFilters ? 'No platforms match the selected filters.' : 'No platforms found.'} />}

      {!loading && !error && data.length > 0 && (
        <>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>platformId</th>
                <SortableHeader field="name" label="name" sort={sort} order={order} onSort={handleSort} />
                <th style={th}>company</th>
                <SortableHeader field="releaseYear" label="year" sort={sort} order={order} onSort={handleSort} />
                <th style={th}>family</th>
                <th style={th}>type</th>
                <th style={th}>status</th>
                <SortableHeader field="gameCount" label="gameCount" sort={sort} order={order} onSort={handleSort} />
                <th scope="col" style={th}>Export</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => {
                const csvKey = `${p.id}:csv`;
                const jsonKey = `${p.id}:json`;
                const csvLoading = exporting[csvKey] === 'csv';
                const jsonLoading = exporting[jsonKey] === 'json';
                return (
                  <tr key={p.id}>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}><Link to={`/admin/games?platform=${encodeURIComponent(p.name)}`} style={{ color: 'var(--link)' }}>{p.id}</Link></td>
                    <td style={td}><Link to={`/admin/games?platform=${encodeURIComponent(p.name)}`} style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</Link></td>
                    <td style={td}>{p.company}</td>
                    <td style={td}>{p.releaseYear ?? '—'}</td>
                    <td style={td}>{p.family ?? '—'}</td>
                    <td style={td}>{p.type ?? '—'}</td>
                    <td style={td}>{p.status}</td>
                    <td style={{ ...td, fontWeight: 600 }} title="Game count from catalog releases">{p.gameCount}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => handleExport(p, 'csv')}
                          disabled={csvLoading || jsonLoading}
                          aria-label={`Export ${p.name} as CSV`}
                          aria-busy={csvLoading}
                          style={{ padding: '4px 8px', fontSize: 11, border: '1px solid var(--card-border)', borderRadius: 4, background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: csvLoading ? 'wait' : 'pointer', opacity: csvLoading ? 0.6 : 1 }}
                        >
                          {csvLoading ? 'CSV…' : 'CSV'}
                        </button>
                        <button
                          onClick={() => handleExport(p, 'json')}
                          disabled={csvLoading || jsonLoading}
                          aria-label={`Export ${p.name} as JSON`}
                          aria-busy={jsonLoading}
                          style={{ padding: '4px 8px', fontSize: 11, border: '1px solid var(--card-border)', borderRadius: 4, background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: jsonLoading ? 'wait' : 'pointer', opacity: jsonLoading ? 0.6 : 1 }}
                        >
                          {jsonLoading ? 'JSON…' : 'JSON'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
const btnSecondary: React.CSSProperties = { padding: '6px 10px', background: 'var(--text-secondary)', color: 'var(--card-bg)', border: 'none', borderRadius: 6, cursor: 'pointer' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: 'var(--card-bg)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', background: 'var(--bg-soft)', fontSize: 12, borderBottom: '1px solid var(--card-border)' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--bg-soft)' };
