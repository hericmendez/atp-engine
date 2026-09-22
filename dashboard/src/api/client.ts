export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  status: number;
}

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function getBaseUrl(): string {
  const base = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_BASE;
  if (base === undefined) return '';
  return base.replace(/\/$/, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getBaseUrl();
  const url = `${base}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...init, headers, credentials: 'include' });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; requestId?: string } } | null)?.error;
    // Handle 401 session expired — redirect to login (avoid loop for login itself)
    if (res.status === 401 && !path.includes('/admin/login') && typeof window !== 'undefined' && window.location.pathname !== '/admin/login') {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      // Use replace to avoid history loop
      window.location.replace(`/admin/login?returnTo=${returnTo}`);
    }
    throw new ApiClientError(
      err?.code ?? `HTTP_${res.status}`,
      err?.message ?? res.statusText,
      res.status,
      err?.requestId,
    );
  }

  return json as T;
}

async function getBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const base = getBaseUrl();
  const url = `${base}${path}`;
  const res = await fetch(url, { method: 'GET', credentials: 'include' });
  if (!res.ok) {
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const err = (json as { error?: { code?: string; message?: string; requestId?: string } } | null)?.error;
    if (res.status === 401 && !path.includes('/admin/login') && typeof window !== 'undefined' && window.location.pathname !== '/admin/login') {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/admin/login?returnTo=${returnTo}`);
    }
    throw new ApiClientError(err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, res.status, err?.requestId);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  let filename: string | null = null;
  if (disposition) {
    const match = disposition.match(/filename="(.+)"/) ?? disposition.match(/filename=(.+)/);
    if (match) filename = match[1].replace(/"/g, '');
  }
  return { blob, filename };
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  getBlob: (path: string) => getBlob(path),
};

// Typed helpers
export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  origin?: string;
}
export interface Single<T> {
  data: T;
  origin?: string;
}
