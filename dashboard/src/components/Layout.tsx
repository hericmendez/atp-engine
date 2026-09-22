import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useTheme } from '../theme';

const linkStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'block',
  padding: '8px 12px',
  borderRadius: 6,
  textDecoration: 'none',
  color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
  background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
  fontWeight: isActive ? 600 : 400,
});

export function Layout() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const handleLogout = async () => {
    try {
      await api.post('/api/v1/admin/logout');
    } catch {
      // ignore
    }
    navigate('/admin/login', { replace: true });
  };
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <nav style={{ width: 220, background: 'var(--sidebar-bg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 4, borderRight: '1px solid var(--card-border)' }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--sidebar-active-text)' }}>ATP Engine — Admin</h1>
        <NavLink to="/admin" end style={({ isActive }) => linkStyle(isActive)}>Overview</NavLink>
        <NavLink to="/admin/games" style={({ isActive }) => linkStyle(isActive)}>Games</NavLink>
        <NavLink to="/admin/platforms" style={({ isActive }) => linkStyle(isActive)}>Platforms</NavLink>
        <NavLink to="/admin/enrichment" style={({ isActive }) => linkStyle(isActive)}>Enrichment</NavLink>
        <NavLink to="/admin/catalog-sync" style={({ isActive }) => linkStyle(isActive)}>Catalog Sync</NavLink>
        <button
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ marginTop: 8, padding: '8px 12px', background: 'var(--sidebar-active-bg)', color: 'var(--sidebar-text)', border: '1px solid var(--card-border)', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontSize: 13 }}
        >
          {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
        </button>
        <button onClick={handleLogout} style={{ marginTop: 8, padding: '8px 12px', background: 'var(--sidebar-active-bg)', color: 'var(--sidebar-text)', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
          Logout
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>MVP — read-only control plane</div>
      </nav>
      <main style={{ flex: 1, padding: 24, background: 'var(--bg)', color: 'var(--text-primary)', overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

export function Loading() {
  return <div style={{ padding: 24, color: 'var(--text-secondary)' }}>Loading…</div>;
}

export function ErrorBox({ message, requestId }: { message: string; requestId?: string }) {
  return (
    <div style={{ padding: 16, background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 8, color: 'var(--error-text)' }}>
      <strong>Error:</strong> {message}
      {requestId && <div style={{ fontSize: 12, marginTop: 4, color: '#7f1d1d' }}>requestId: {requestId}</div>}
    </div>
  );
}

export function Empty({ message }: { message: string }) {
  return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>{message}</div>;
}
