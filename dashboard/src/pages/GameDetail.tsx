import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import type { GameDto } from '../api/types';
import { Loading, ErrorBox, Empty } from '../components/Layout';

function formatTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    api
      .get<{ data: GameDto }>(`/api/v1/admin/games/${encodeURIComponent(id)}`)
      .then((res) => {
        setGame(res.data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e as ApiClientError);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <Loading />;
  if (error) {
    if (error.status === 404) return <ErrorBox message={`Game not found: ${id}`} requestId={error.requestId} />;
    return <ErrorBox message={error.message} requestId={error.requestId} />;
  }
  if (!game) return <Empty message="Game not found." />;

  const hasDescription = typeof game.description === 'string' && /\S/.test(game.description);
  const hasDevelopers = game.developers.length > 0;
  const hasPublishers = game.publishers.length > 0;
  const hasGenres = game.genres.length > 0;
  const hasCover = Boolean(game.cover?.url);
  const hasReleases = game.releases.length > 0;

  const sortedReleases = [...game.releases].sort((a, b) => {
    const ay = a.releaseDate?.year ?? 0;
    const by = b.releaseDate?.year ?? 0;
    if (ay !== by) return by - ay;
    const am = a.releaseDate?.month ?? 0;
    const bm = b.releaseDate?.month ?? 0;
    if (am !== bm) return bm - am;
    const ad = a.releaseDate?.day ?? 0;
    const bd = b.releaseDate?.day ?? 0;
    return bd - ad;
  });

  // Evidence grouped by source
  const evidenceBySource = game.evidence.reduce<Record<string, typeof game.evidence>>((acc, e) => {
    (acc[e.source] = acc[e.source] || []).push(e);
    return acc;
  }, {});

  return (
    <div>
      <button onClick={() => navigate(-1)} style={{ color: 'var(--link)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>← Back to games</button>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '12px 0' }}>{game.titles[0]?.value ?? game.id}</h2>

      <Section title="Identifiers">
        <Field label="domainId" value={game.id} mono />
        <Field label="createdAt" value={game.createdAt ? `${new Date(game.createdAt).toLocaleString()} (${formatTimeAgo(game.createdAt)})` : '—'} title={game.createdAt ?? undefined} />
        <Field label="updatedAt" value={game.updatedAt ? `${new Date(game.updatedAt).toLocaleString()} (${formatTimeAgo(game.updatedAt)})` : '—'} title={game.updatedAt ?? undefined} />
        <Field label="lastEnrichedAt" value={game.lastEnrichedAt ? `${new Date(game.lastEnrichedAt).toLocaleString()} (${formatTimeAgo(game.lastEnrichedAt)})` : '—'} title={game.lastEnrichedAt ?? undefined} />
      </Section>

      <Section title="DATA QUALITY">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
          <QualityItem ok={hasDescription} label="Description" />
          <QualityItem ok={hasDevelopers} label="Developers" />
          <QualityItem ok={hasPublishers} label="Publishers" />
          <QualityItem ok={hasGenres} label="Genres" />
          <QualityItem ok={hasCover} label="Cover" />
          <QualityItem ok={hasReleases} label="Releases" />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>Derived frontend-only from DTO — no backend metric</div>
      </Section>

      <Section title="Titles">
        {game.titles.map((t, i) => (
          <div key={i} style={row}><span style={labelStyle}>{t.type}</span>{t.value}</div>
        ))}
      </Section>

      <Section title="Classification">
        <Field label="classification" value={game.classification} />
        <Field label="completeness" value={game.completeness} />
        <Field label="gameType" value={game.gameType ?? '—'} />
        <Field label="gameStatus" value={game.gameStatus ?? '—'} />
      </Section>

      <Section title="Description">
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{hasDescription ? game.description : '—'}</div>
      </Section>

      <Section title="Genres / Developers / Publishers">
        <Field label="genres" value={game.genres.map((g) => g.name).join(', ') || '—'} />
        <Field label="developers" value={game.developers.map((d) => d.name).join(', ') || '—'} />
        <Field label="publishers" value={game.publishers.map((p) => p.name).join(', ') || '—'} />
      </Section>

      <Section title={`Releases (${game.releases.length}) — sorted by date desc`}>
        {game.releases.length === 0 ? <div style={{ color: 'var(--text-secondary)' }}>— no releases</div> : sortedReleases.map((r) => (
          <div key={r.id} style={{ border: '1px solid var(--card-border)', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 13, background: 'var(--bg)' }}>
            <div><strong>{r.platform.name}</strong> {r.platform.family ? `(${r.platform.family})` : ''} — {r.platform.type} <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}>{r.id}</span></div>
            <div>releaseDate: {r.releaseDate ? `${r.releaseDate.year}-${String(r.releaseDate.month ?? '?').padStart(2,'0')}-${String(r.releaseDate.day ?? '?').padStart(2,'0')} (${r.releaseDate.precision})` : '—'}</div>
            <div>region: {r.region?.name ?? '—'} | version: {r.version ?? '—'} | edition: {r.edition ?? '—'}</div>
            {(r.distributionChannels.length > 0 || r.launchers.length > 0) && (
              <div>channels: {r.distributionChannels.map((c: { name: string }) => c.name).join(', ') || '—'} | launchers: {r.launchers.map((l: { name: string }) => l.name).join(', ') || '—'}</div>
            )}
          </div>
        ))}
      </Section>

      <Section title="Cover">
        {game.cover ? (
          <div>
            <div style={{ fontSize: 13, wordBreak: 'break-all' }}><strong>{game.cover.source}</strong> {game.cover.sourceId ? `(${game.cover.sourceId})` : ''} — {game.cover.type} {game.cover.width && game.cover.height ? `(${game.cover.width}×${game.cover.height})` : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{game.cover.url}</div>
            <img src={game.cover.url} alt="cover" loading="lazy" style={{ maxWidth: 260, marginTop: 8, borderRadius: 6, border: '1px solid var(--card-border)' }} onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = 'none';
              const parent = img.parentElement;
              if (parent && !parent.querySelector('.cover-fallback')) {
                const fb = document.createElement('div');
                fb.className = 'cover-fallback';
                fb.textContent = 'Cover image failed to load';
                fb.style.cssText = 'padding:12px;background:var(--error-bg);border:1px solid var(--error-border);border-radius:6px;color:var(--error-text);font-size:13px;margin-top:8px';
                parent.appendChild(fb);
              }
            }} />
          </div>
        ) : (
          <div style={{ padding: 16, background: 'var(--bg-soft)', borderRadius: 6, color: 'var(--text-secondary)', textAlign: 'center' }}>— no cover <span style={{ fontSize: 11 }}>(hasCover=false)</span></div>
        )}
      </Section>

      <Section title={`Relationships (${game.relationships.length})`}>
        {game.relationships.length === 0 ? <div style={{ color: 'var(--text-secondary)' }}>— none</div> : game.relationships.map((rel, i) => (
          <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--bg)' }}>{rel.sourceGameId} → {rel.targetGameId} <span style={{ color: 'var(--text-muted)' }}>({rel.type})</span></div>
        ))}
      </Section>

      <Section title="External Identifiers">
        {game.externalIdentifiers.length === 0 ? '—' : game.externalIdentifiers.map((e, i) => <div key={i} style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.source}:{e.id}</div>)}
      </Section>

      <Section title={`Evidence / Provenance — ${game.evidence.length} record(s)`}>
        {game.evidence.length === 0 ? <div style={{ color: 'var(--text-secondary)' }}>— no evidence</div> : (
          <div>
            {Object.entries(evidenceBySource).map(([src, list]) => (
              <div key={src} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{src} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>({list.length})</span></div>
                {list.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', padding: '2px 0' }}>
                    {e.source}:{e.externalId} @ {new Date(e.retrievedAt).toLocaleString()} <span title={e.rawTitle ?? undefined} style={{ color: 'var(--text-muted)' }}>{e.rawTitle ? `— "${e.rawTitle.slice(0,80)}"` : ''}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>Each evidence links a field to its source + timestamp. No field→source mapping invented; rawTitle helps diagnose title mismatches.</div>
          </div>
        )}
      </Section>
    </div>
  );
}

function QualityItem({ ok, label }: { ok: boolean; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, background: ok ? '#dcfce7' : '#fee2e2', color: ok ? '#166534' : 'var(--error-text)', fontWeight: 600 }}>{ok ? '✓' : '✗'} {label}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, padding: 16 }}>
      <h3 style={{ fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, value, mono, title }: { label: string; value: string; mono?: boolean; title?: string }) {
  return (
    <div style={row}><span style={labelStyle}>{label}</span><span title={title} style={{ fontFamily: mono ? 'monospace' : undefined, fontSize: mono ? 12 : 13 }}>{value}</span></div>
  );
}
const row: React.CSSProperties = { display: 'flex', gap: 8, fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--bg)' };
const labelStyle: React.CSSProperties = { minWidth: 140, color: 'var(--text-secondary)', fontSize: 12 };
