import { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiClientError } from '../api/client';

export function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const pwdRef = useRef<HTMLInputElement>(null);

  const returnTo = searchParams.get('returnTo') || '/admin';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/v1/admin/login', { username, password });
      navigate(decodeURIComponent(returnTo), { replace: true });
    } catch (err) {
      setError(err as ApiClientError);
      setLoading(false);
    }
  };

  const toggleShow = () => {
    setShowPassword((v) => !v);
    // keep focus on input after toggle
    requestAnimationFrame(() => pwdRef.current?.focus());
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <form onSubmit={onSubmit} style={{ background: 'var(--card-bg)', padding: 24, borderRadius: 8, minWidth: 360, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Admin Login</h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus style={inp} placeholder="admin" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          Password
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
            <input
              ref={pwdRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ ...inp, flex: 1, paddingRight: 40 }}
              aria-label="Password"
            />
            <button
              type="button"
              onClick={toggleShow}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: 6,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                fontSize: 16,
                lineHeight: 1,
                color: 'var(--text-secondary)',
              }}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
        </label>
        {error && (
          <div style={{ background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, padding: 10, color: 'var(--error-text)', fontSize: 13 }}>
            {error.code === 'RATE_LIMITED' ? 'Too many attempts. Try again later.' : error.message}
            {error.requestId && <div style={{ fontSize: 11, marginTop: 4 }}>requestId: {error.requestId}</div>}
          </div>
        )}
        <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Session expires in 8 hours. Use ADMIN_USERNAME / ADMIN_PASSWORD_HASH.</div>
      </form>
    </div>
  );
}

const inp: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: 6, fontSize: 14, background: 'var(--input-bg)', color: 'var(--input-text)' };
const btn: React.CSSProperties = { padding: '10px 14px', background: 'var(--sidebar-bg)', color: 'var(--card-bg)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
