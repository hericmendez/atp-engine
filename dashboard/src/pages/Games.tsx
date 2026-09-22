import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import type { GameDto } from '../api/types';
import { Loading, ErrorBox, Empty } from '../components/Layout';
import { Pagination } from '../components/Pagination';
import { PageSizeSelector } from '../components/PageSizeSelector';
import { SortableHeader } from '../components/SortableHeader';

type Paginated = { data: GameDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

const CLASSIFICATIONS = ['GAME','DLC','EXPANSION','MOVIE','TV_SHOW','ANIME','SOUNDTRACK','BOOK','HARDWARE','PROMOTIONAL','CHARACTER','FRANCHISE','PERSON','EVENT','UNKNOWN'];
const COMPLETENESS = ['NOT_FOUND','FOUND_PARTIAL','FOUND_SUFFICIENT','FOUND_COMPLETE'];

function getParam(params: URLSearchParams, key: string, fallback: string): string {
  return params.get(key) ?? fallback;
}

export function Games() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [games, setGames] = useState<GameDto[]>([]);
  const [pagination, setPagination] = useState<Paginated['pagination'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);

  const [searchInput, setSearchInput] = useState(getParam(searchParams, 'search', ''));
  const [titleInput, setTitleInput] = useState(getParam(searchParams, 'title', ''));

  const [platformOptions, setPlatformOptions] = useState<{ name: string; family: string | null }[]>([]);
  const [families, setFamilies] = useState<string[]>([]);
  const [platformsLoading, setPlatformsLoading] = useState(true);
  const [platformsError, setPlatformsError] = useState<string | null>(null);

  const page = parseInt(getParam(searchParams, 'page', '1'), 10) || 1;
  const sort = getParam(searchParams, 'sort', 'updatedAt');
  const order = getParam(searchParams, 'order', 'desc');

  const hasActiveFilters = Array.from(searchParams.entries()).some(([k, v]) => v && !['page','limit','sort','order'].includes(k));

  const updateParams = (updates: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined || v === '' ) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.set('page', '1');
    else if (!next.has('page')) next.set('page', '1');
    setSearchParams(next);
  };

  const setPage = (p: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  };

  const handleSort = (field: string) => {
    const next = new URLSearchParams(searchParams);
    if (sort === field) {
      next.set('order', order === 'asc' ? 'desc' : 'asc');
    } else {
      next.set('sort', field);
      next.set('order', 'asc');
    }
    next.set('page', '1');
    setSearchParams(next);
  };

  const fetchGames = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(searchParams);
      if (!params.has('limit')) params.set('limit', '20');
      if (!params.has('page')) params.set('page', '1');
      const res = await api.get<Paginated>(`/api/v1/admin/games?${params.toString()}`);
      setGames(res.data);
      setPagination(res.pagination);
      setLoading(false);
    } catch (e) {
      setError(e as ApiClientError);
      setLoading(false);
    }
  };

  useEffect(() => {
    setSearchInput(getParam(searchParams, 'search', ''));
    setTitleInput(getParam(searchParams, 'title', ''));
    fetchGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const loadPlatforms = async () => {
      setPlatformsLoading(true);
      setPlatformsError(null);
      try {
        const [p1, p2] = await Promise.all([
          api.get<{ data: { name: string; family: string | null }[] }>(`/api/v1/platforms/summary?page=1&limit=100`),
          api.get<{ data: { name: string; family: string | null }[] }>(`/api/v1/platforms/summary?page=2&limit=100`),
        ]);
        if (cancelled) return;
        const all = [...p1.data, ...p2.data];
        // dedup by name, sort alphabetically
        const map = new Map<string, { name: string; family: string | null }>();
        for (const p of all) {
          if (!map.has(p.name)) map.set(p.name, p);
        }
        const sorted = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        setPlatformOptions(sorted);
        const famSet = new Set<string>();
        for (const p of sorted) {
          if (p.family) famSet.add(p.family);
        }
        setFamilies(Array.from(famSet).sort((a, b) => a.localeCompare(b)));
        setPlatformsLoading(false);
      } catch (e) {
        if (cancelled) return;
        setPlatformsError(e instanceof Error ? e.message : String(e));
        setPlatformsLoading(false);
      }
    };
    loadPlatforms();
    return () => { cancelled = true; };
  }, []);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search: searchInput || undefined, title: titleInput || undefined }, true);
  };

  const clearAll = () => {
    setSearchInput('');
    setTitleInput('');
    setSearchParams(new URLSearchParams());
  };

  const retryPlatforms = () => {
    setPlatformOptions([]);
    setFamilies([]);
    setPlatformsLoading(true);
    setPlatformsError(null);
    // trigger re-load by toggling a dummy state via effect - simplest re-call
    api.get<{ data: { name: string; family: string | null }[] }>(`/api/v1/platforms/summary?page=1&limit=100`)
      .then((p1) => api.get<{ data: { name: string; family: string | null }[] }>(`/api/v1/platforms/summary?page=2&limit=100`).then((p2) => {
        const all = [...p1.data, ...p2.data];
        const map = new Map<string, { name: string; family: string | null }>();
        for (const p of all) if (!map.has(p.name)) map.set(p.name, p);
        const sorted = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        setPlatformOptions(sorted);
        const famSet = new Set<string>();
        for (const p of sorted) if (p.family) famSet.add(p.family);
        setFamilies(Array.from(famSet).sort((a, b) => a.localeCompare(b)));
        setPlatformsLoading(false);
      }))
      .catch((e) => { setPlatformsError(e instanceof Error ? e.message : String(e)); setPlatformsLoading(false); });
  };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Games</h2>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>search covers title/developers/publishers (OR). title is titles.value only.</p>

      <form onSubmit={onSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, background: 'var(--card-bg)', padding: 12, borderRadius: 8, border: '1px solid var(--card-border)' }}>
        <input placeholder="search (title/dev/pub)" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} style={inp} title="search: titles OR developers OR publishers" />
        <input placeholder="title" value={titleInput} onChange={(e) => setTitleInput(e.target.value)} style={inp} title="title: titles.value only" />
        {/* Platform select */}
        {platformsLoading ? (
          <select disabled style={inp}><option>Loading platforms...</option></select>
        ) : platformsError ? (
          <span style={{ fontSize: 12, color: 'var(--error-text)' }}>Platform load failed <button type="button" onClick={retryPlatforms} style={{ ...btn, padding: '4px 8px', fontSize: 11 }}>Retry</button></span>
        ) : (() => {
          const currentPlatform = getParam(searchParams,'platform','');
          const hasUnknown = currentPlatform && !platformOptions.some((p) => p.name === currentPlatform);
          return (
            <select value={currentPlatform} onChange={(e) => updateParams({ platform: e.target.value || undefined })} style={inp}>
              <option value="">All platforms</option>
              {hasUnknown && <option value={currentPlatform}>{currentPlatform} (unknown)</option>}
              {platformOptions.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          );
        })()}
        {/* PlatformFamily select */}
        {platformsLoading ? (
          <select disabled style={inp}><option>Loading families...</option></select>
        ) : platformsError ? (
          <span style={{ fontSize: 12, color: 'var(--error-text)' }}>Family load failed</span>
        ) : (() => {
          const currentFamily = getParam(searchParams,'platformFamily','');
          const hasUnknownFamily = currentFamily && !families.includes(currentFamily);
          return (
            <select value={currentFamily} onChange={(e) => updateParams({ platformFamily: e.target.value || undefined })} style={inp}>
              <option value="">All families</option>
              {hasUnknownFamily && <option value={currentFamily}>{currentFamily} (unknown)</option>}
              {families.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          );
        })()}
        <input placeholder="genre" value={getParam(searchParams,'genre','')} onChange={(e) => updateParams({ genre: e.target.value || undefined })} style={inp} />
        <input placeholder="developer" value={getParam(searchParams,'developer','')} onChange={(e) => updateParams({ developer: e.target.value || undefined })} style={inp} />
        <input placeholder="publisher" value={getParam(searchParams,'publisher','')} onChange={(e) => updateParams({ publisher: e.target.value || undefined })} style={inp} />
        <input placeholder="releaseYear" value={getParam(searchParams,'releaseYear','')} onChange={(e) => updateParams({ releaseYear: e.target.value || undefined })} style={{...inp, width: 110}} type="number" />
        <input placeholder="yearFrom" value={getParam(searchParams,'releaseYearFrom','')} onChange={(e) => updateParams({ releaseYearFrom: e.target.value || undefined })} style={{...inp, width: 90}} type="number" />
        <input placeholder="yearTo" value={getParam(searchParams,'releaseYearTo','')} onChange={(e) => updateParams({ releaseYearTo: e.target.value || undefined })} style={{...inp, width: 90}} type="number" />
        <select value={getParam(searchParams,'classification','')} onChange={(e) => updateParams({ classification: e.target.value || undefined })} style={inp}>
          <option value="">classification</option>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={getParam(searchParams,'completeness','')} onChange={(e) => updateParams({ completeness: e.target.value || undefined })} style={inp}>
          <option value="">completeness</option>{COMPLETENESS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={getParam(searchParams,'hasCover','')} onChange={(e) => updateParams({ hasCover: e.target.value || undefined })} style={inp}><option value="">hasCover</option><option value="true">true</option><option value="false">false</option></select>
        <select value={getParam(searchParams,'hasDescription','')} onChange={(e) => updateParams({ hasDescription: e.target.value || undefined })} style={inp}><option value="">hasDescription</option><option value="true">true</option><option value="false">false</option></select>
        <select value={getParam(searchParams,'hasDevelopers','')} onChange={(e) => updateParams({ hasDevelopers: e.target.value || undefined })} style={inp}><option value="">hasDevelopers</option><option value="true">true</option><option value="false">false</option></select>
        <select value={getParam(searchParams,'hasPublishers','')} onChange={(e) => updateParams({ hasPublishers: e.target.value || undefined })} style={inp}><option value="">hasPublishers</option><option value="true">true</option><option value="false">false</option></select>
        <select value={getParam(searchParams,'needsCover','')} onChange={(e) => updateParams({ needsCover: e.target.value || undefined })} style={inp}><option value="">needsCover</option><option value="true">true</option></select>
        <select value={getParam(searchParams,'needsCompanies','')} onChange={(e) => updateParams({ needsCompanies: e.target.value || undefined })} style={inp}><option value="">needsCompanies</option><option value="true">true</option></select>
        <button type="submit" style={btn}>Search</button>
        <button type="button" onClick={clearAll} style={btnSecondary}>Clear filters</button>
      </form>

      {loading && <Loading />}
      {error && <ErrorBox message={error.message} requestId={error.requestId} />}
      {!loading && !error && games.length === 0 && <Empty message={hasActiveFilters ? 'No games match the selected filters. Try clearing filters.' : 'No games found.'} />}
      {!loading && !error && games.length > 0 && (
        <>
          <table style={table}>
            <thead>
              <tr>
                <SortableHeader field="title" label="Title" sort={sort} order={order} onSort={handleSort} />
                <SortableHeader field="domainId" label="ID" sort={sort} order={order} onSort={handleSort} />
                <th style={th}>gameType</th>
                <th style={th}>gameStatus</th>
                <SortableHeader field="completeness" label="completeness" sort={sort} order={order} onSort={handleSort} />
                <th style={th}>classification</th>
                <th style={th}>Platform</th>
                <th style={th}>Cover</th>
                <th style={th}>Developers</th>
                <th style={th}>Publishers</th>
                <SortableHeader field="updatedAt" label="Updated" sort={sort} order={order} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id}>
                  <td style={td}><Link to={`/admin/games/${encodeURIComponent(g.id)}`} style={{ color: 'var(--link)' }}>{g.titles[0]?.value ?? '—'}</Link></td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{g.id}</td>
                  <td style={td}><span style={badgeType(g.gameType)}>{g.gameType ?? '—'}</span></td>
                  <td style={td}>{g.gameStatus ?? '—'}</td>
                  <td style={td}><span style={badgeClass(g.classification)}>{g.classification}</span></td>
                  <td style={td}><span style={badgeComp(g.completeness)}>{g.completeness}</span></td>
                  <td style={td}>{g.releases[0]?.platform.name ?? '—'}</td>
                  <td style={td}>{g.cover ? '✓' : '✗'}</td>
                  <td style={td}>{g.developers.map((d) => d.name).join(', ') || '—'}</td>
                  <td style={td}>{g.publishers.map((p) => p.name).join(', ') || '—'}</td>
                  <td style={td} title={g.updatedAt ?? undefined}>{g.updatedAt ? new Date(g.updatedAt).toLocaleDateString() : '—'}</td>
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
const btn: React.CSSProperties = { padding: '6px 10px', background: 'var(--text-primary)', color: 'var(--card-bg)', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { ...btn, background: 'var(--text-secondary)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: 'var(--card-bg)', borderRadius: 8, overflow: 'hidden' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', background: 'var(--bg-soft)', fontSize: 12, borderBottom: '1px solid var(--card-border)' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--bg-soft)', verticalAlign: 'top' };

export function badgeType(v: string | null): React.CSSProperties {
  if (!v) return {};
  return { background: '#e0f2fe', color: '#0f172a', padding: '2px 6px', borderRadius: 4, fontSize: 11 };
}
export function badgeClass(v: string): React.CSSProperties {
  if (v === 'UNKNOWN') {
    return { background: 'var(--bg-soft)', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: 4, fontSize: 11 };
  }
  const bg = v === 'GAME' ? '#dcfce7' : '#fef9c3';
  return { background: bg, color: '#0f172a', padding: '2px 6px', borderRadius: 4, fontSize: 11 };
}
export function badgeComp(v: string): React.CSSProperties {
  const bg = v === 'FOUND_COMPLETE' ? '#dcfce7' : v === 'NOT_FOUND' ? '#fee2e2' : '#fef9c3';
  return { background: bg, color: '#0f172a', padding: '2px 6px', borderRadius: 4, fontSize: 11 };
}
