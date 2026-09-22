import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { Overview } from './pages/Overview';
import { Games } from './pages/Games';
import { GameDetail } from './pages/GameDetail';
import { Platforms } from './pages/Platforms';
import { Enrichment } from './pages/Enrichment';
import { EnrichmentDetail } from './pages/EnrichmentDetail';
import { CatalogSync } from './pages/CatalogSync';
import { CatalogSyncDetail } from './pages/CatalogSyncDetail';
import { Login } from './pages/Login';
import { api } from './api/client';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: { authenticated: boolean } }>('/api/v1/admin/session')
      .then((res) => {
        if (cancelled) return;
        if (res.data.authenticated) {
          setAuthed(true);
          setChecking(false);
        } else {
          navigate(`/admin/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        navigate(`/admin/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate]);

  if (checking) return <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Checking authentication…</div>;
  if (!authed) return null;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<Navigate to="/admin/" replace />} />
        <Route
          path="/admin/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Overview />} />
          <Route path="games" element={<Games />} />
          <Route path="games/:id" element={<GameDetail />} />
          <Route path="platforms" element={<Platforms />} />
          <Route path="enrichment" element={<Enrichment />} />
          <Route path="enrichment/:id" element={<EnrichmentDetail />} />
          <Route path="catalog-sync" element={<CatalogSync />} />
          <Route path="catalog-sync/:id" element={<CatalogSyncDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
