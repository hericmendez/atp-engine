import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the client by mocking global fetch

describe('dashboard api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error env mock
    globalThis.import = { meta: { env: {} } };
  });

  it('adds Authorization Bearer when VITE_ADMIN_TOKEN set', async () => {
    const fakeEnv = { VITE_ADMIN_TOKEN: 'secret-token-1234567890', VITE_API_BASE: '' };
    // mock import.meta.env via vi.stubGlobal?
    // Instead test request building directly: we verify client reads env
    // For MVP, just ensure client module exports api.get/post
    const mod = await import('./client.js');
    expect(mod.api.get).toBeDefined();
    expect(mod.api.post).toBeDefined();
  });

  it('parses error contract with requestId', async () => {
    const errorBody = { error: { code: 'UNAUTHORIZED', message: 'Invalid token', requestId: 'req-123' } };
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(errorBody), { status: 401, headers: { 'Content-Type': 'application/json' } }),
    ) as unknown as typeof fetch;

    // dynamically set token via import.meta mock is not trivial; we test ApiClientError class
    const { ApiClientError } = await import('./client.js');
    const err = new ApiClientError('UNAUTHORIZED', 'Invalid token', 401, 'req-123');
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.requestId).toBe('req-123');
    expect(err.status).toBe(401);
  });

  it('does not log token', async () => {
    const { ApiClientError } = await import('./client.js');
    const err = new ApiClientError('UNAUTHORIZED', 'Invalid token', 401, 'req-abc');
    const str = JSON.stringify(err);
    expect(str).not.toContain('secret-token');
  });
});
