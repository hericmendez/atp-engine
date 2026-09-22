import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';
import { Loading, ErrorBox, Empty } from '../components/Layout';

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

export function CatalogSyncDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<HistoryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<{ data: HistoryEntry }>(`/api/v1/catalog/sync/history/${encodeURIComponent(id)}`)
      .then((res) => {
        setEntry(res.data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e as ApiClientError);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <Loading />;
  if (error) {
    if (error.status === 404) return <ErrorBox message={`Catalog sync not found: ${id}`} requestId={error.requestId} />;
    return <ErrorBox message={error.message} requestId={error.requestId} />;
  }
  if (!entry) return <Empty message="Not found" />;

  return (
    <div>
      <button onClick={() => navigate(-1)} style={{ color: 'var(--link)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>← Back</button>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: '12px 0' }}>{entry.id}</h2>

      <Section title="Run">
        <Field label="status" value={entry.status} />
        <Field label="trigger" value={entry.trigger} />
        <Field label="dryRun" value={entry.dryRun ? 'yes' : 'no'} />
        <Field label="startedAt" value={new Date(entry.startedAt).toLocaleString()} />
        <Field label="completedAt" value={entry.completedAt ? new Date(entry.completedAt).toLocaleString() : '—'} />
        <Field label="duration" value={entry.durationMs !== null ? `${Math.round(entry.durationMs / 1000)}s` : '—'} />
        <Field label="from" value={entry.from} />
        <Field label="to" value={entry.to} />
        {entry.error && <div style={{ color: 'var(--error-text)', fontSize: 13 }}>error: {entry.error}</div>}
      </Section>

      <Section title={`Totals — ${entry.totals.candidatesFound} candidates`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, fontSize: 13 }}>
          <div>candidatesFound: {entry.totals.candidatesFound}</div>
          <div>newGames: {entry.totals.newGames}</div>
          <div>existingGames: {entry.totals.existingGames}</div>
          <div>updatedGames: {entry.totals.updatedGames}</div>
          <div>rejected: {entry.totals.rejected}</div>
          <div>errors: {entry.totals.errors}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>candidatesFound ≠ newGames; rejected includes ineligible/quarantined.</div>
      </Section>

      <Section title={`Platforms (${entry.requestedPlatformIds.length} requested)`}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>Requested: {entry.requestedPlatformIds.join(', ') || '—'}</div>
        <div style={{ fontSize: 13, marginBottom: 8 }}>Resolved: {entry.resolvedPlatformNames.join(', ') || '—'}</div>
        {entry.platformResults.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)' }}>— no platform results</div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>platform</th><th style={th}>status</th><th style={th}>candidates</th><th style={th}>new</th><th style={th}>existing</th><th style={th}>updated</th><th style={th}>rejected</th><th style={th}>errors</th><th style={th}>error</th>
              </tr>
            </thead>
            <tbody>
              {entry.platformResults.map((p) => (
                <tr key={p.platformId}>
                  <td style={td}>
                    <Link to={`/admin/games?platform=${encodeURIComponent(p.platformName)}`} style={{ color: 'var(--link)' }}>{p.platformName}</Link>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)' }}> ({p.platformId})</span>
                  </td>
                  <td style={td}><span style={badge(p.status)}>{p.status}</span></td>
                  <td style={td}>{p.candidatesFound}</td>
                  <td style={td}>{p.newGames}</td>
                  <td style={td}>{p.existingGames}</td>
                  <td style={td}>{p.updatedGames}</td>
                  <td style={td}>{p.rejected}</td>
                  <td style={td}>{p.errors}</td>
                  <td style={{ ...td, color: p.error ? 'var(--error-text)' : undefined, fontSize: 11 }}>{p.error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 8 }}>
          <Link to="/admin/platforms" style={{ fontSize: 12, color: 'var(--link)' }}>→ View platforms</Link>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16, background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 8, padding: 16 }}>
      <h3 style={{ fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--bg)' }}>
      <span style={{ minWidth: 140, color: 'var(--text-secondary)', fontSize: 12 }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
function badge(status: string): React.CSSProperties {
  const map: Record<string, string> = { completed: '#16a34a', failed: 'var(--error-text)' };
  return { background: map[status] ?? 'var(--text-secondary)', color: 'var(--card-bg)', padding: '2px 6px', borderRadius: 12, fontSize: 11, fontWeight: 700 };
}
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', background: 'var(--card-bg)' };
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', background: 'var(--bg-soft)', fontSize: 12, borderBottom: '1px solid var(--card-border)' };
const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--bg-soft)' };
