import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import { loadConfig, resetConfig } from '../src/infrastructure/config/config.js';
import { clearAllSessions } from '../src/infrastructure/auth/admin-session.js';
import { hashAdminPassword, parseHash } from '../src/infrastructure/auth/admin-password.js';
import { clearLoginRateLimit } from '../src/interfaces/http/routes/admin-auth-routes.js';

describe('Admin Login + HttpOnly Session — Fase 4.14/4.16', () => {
  beforeEach(() => {
    resetConfig();
    clearAllSessions();
    clearLoginRateLimit();
  });

  async function loadTestConfig(password: string, extra: Record<string, string> = {}) {
    const hash = await hashAdminPassword(password);
    loadConfig({ ADMIN_USERNAME: 'admin', ADMIN_PASSWORD_HASH: hash, ...extra });
    return hash;
  }

  function buildApp() {
    const fakeCatalog = { listGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }), searchGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }), getGameById: async () => { throw new Error('no'); } } as never;
    const fakeSync = { sync: async () => ({ status: 'completed', platforms: [], totals: { candidatesFound: 0, newGames: 0, existingGames: 0, updatedGames: 0, rejected: 0, errors: 0 }, dryRun: false, durationMs: 0 }) } as never;
    return createApp({
      games: { catalogService: fakeCatalog },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: { listPlatforms: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }), getPlatformById: async () => { throw new Error('no'); } } as never },
      catalogSync: { catalogSyncService: fakeSync },
      catalogSyncHistory: { historyRepository: { create: async () => 'h1', update: async () => {}, findById: async () => null, findMany: async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }) } as never },
      admin: { gameAdminService: { createGame: async () => { throw new Error('no'); }, updateGame: async () => { throw new Error('no'); }, deleteGame: async () => {} } as never },
      adminGamesRead: { catalogService: fakeCatalog },
      adminCatalogSync: { catalogSyncService: fakeSync },
    });
  }

  it('POST /admin/login with valid credentials → 200 + Set-Cookie HttpOnly', async () => {
    await loadTestConfig('secret123', { ADMIN_API_TOKEN: 'test-token-1234567890123456' });
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.data.authenticated).toBe(true);
    const cookie = res.headers['set-cookie']?.[0] as string | undefined;
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
  });

  it('POST /admin/login invalid credentials → 401', async () => {
    await loadTestConfig('secret123', { ADMIN_API_TOKEN: 'test-token-1234567890123456' });
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /admin/login invalid body → 400', async () => {
    await loadTestConfig('secret123');
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/login').send({ username: '' });
    expect(res.status).toBe(400);
  });

  it('GET /admin/session without cookie → not authenticated', async () => {
    await loadTestConfig('secret123');
    const app = buildApp();
    const res = await request(app).get('/api/v1/admin/session');
    expect(res.body.data.authenticated).toBe(false);
  });

  it('GET /admin/session with valid cookie → authenticated', async () => {
    await loadTestConfig('secret123');
    const app = buildApp();
    const login = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'secret123' });
    const cookie = login.headers['set-cookie'][0] as string;
    const res = await request(app).get('/api/v1/admin/session').set('Cookie', cookie);
    expect(res.body.data.authenticated).toBe(true);
    expect(res.body.data.username).toBe('admin');
  });

  it('POST /admin/logout invalidates session', async () => {
    await loadTestConfig('secret123');
    const app = buildApp();
    const login = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'secret123' });
    const cookie = login.headers['set-cookie'][0] as string;
    const logout = await request(app).post('/api/v1/admin/logout').set('Cookie', cookie);
    expect(logout.status).toBe(200);
    const check = await request(app).get('/api/v1/admin/session').set('Cookie', cookie);
    expect(check.body.data.authenticated).toBe(false);
  });

  it('GET /admin/games without auth → 401', async () => {
    await loadTestConfig('secret123', { ADMIN_API_TOKEN: 'test-token-1234567890123456' });
    const app = buildApp();
    const res = await request(app).get('/api/v1/admin/games');
    expect(res.status).toBe(401);
  });

  it('GET /admin/games with session → 200', async () => {
    await loadTestConfig('secret123');
    const app = buildApp();
    const login = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'secret123' });
    const cookie = login.headers['set-cookie'][0] as string;
    const res = await request(app).get('/api/v1/admin/games').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('GET /admin/games with Bearer → 200 (dual auth)', async () => {
    await loadTestConfig('secret123', { ADMIN_API_TOKEN: 'test-token-1234567890123456' });
    const app = buildApp();
    const res = await request(app).get('/api/v1/admin/games').set('Authorization', 'Bearer test-token-1234567890123456');
    expect(res.status).toBe(200);
  });

  it('POST /admin/games without auth → 401', async () => {
    await loadTestConfig('secret123', { ADMIN_API_TOKEN: 'test-token-1234567890123456' });
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/games').send({ titles: [{ value: 'Test' }] });
    expect(res.status).toBe(401);
  });

  it('POST /catalog/sync without auth → 401 (protected)', async () => {
    await loadTestConfig('secret123', { ADMIN_API_TOKEN: 'test-token-1234567890123456' });
    const app = buildApp();
    const res = await request(app).post('/api/v1/catalog/sync').send({ activeOnly: true, from: '2025-01-01', to: '2025-12-31' });
    expect(res.status).toBe(401);
  });

  it('POST /admin/catalog/sync without auth → 401', async () => {
    await loadTestConfig('secret123');
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/catalog/sync').send({ activeOnly: true, from: '2025-01-01', to: '2025-12-31' });
    expect(res.status).toBe(401);
  });

  it('POST /admin/catalog/sync with session → 200', async () => {
    await loadTestConfig('secret123');
    const app = buildApp();
    const login = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'secret123' });
    const cookie = login.headers['set-cookie'][0] as string;
    const res = await request(app).post('/api/v1/admin/catalog/sync').set('Cookie', cookie).send({ activeOnly: true, from: '2025-01-01', to: '2025-12-31' });
    expect([200, 409]).toContain(res.status);
  });

  it('login rate limiting: 6th attempt → 429', async () => {
    await loadTestConfig('secret123');
    const app = buildApp();
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'wrong' });
    }
    const res = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(429);
  });

  it('hash generation produces different salts for same password', async () => {
    const h1 = await hashAdminPassword('same-password');
    const h2 = await hashAdminPassword('same-password');
    expect(h1).not.toBe(h2);
    const p1 = parseHash(h1)!;
    const p2 = parseHash(h2)!;
    expect(p1.saltHex).not.toBe(p2.saltHex);
    // both verify
    const { verifyAdminPassword } = await import('../src/infrastructure/auth/admin-password.js');
    expect(await verifyAdminPassword('same-password', h1)).toBe(true);
    expect(await verifyAdminPassword('same-password', h2)).toBe(true);
    expect(await verifyAdminPassword('wrong', h1)).toBe(false);
  });

  it('ADMIN_PASSWORD alone does not authenticate (F-001 regression)', async () => {
    // No hash set, only attempt via plaintext config should not exist
    loadConfig({ ADMIN_USERNAME: 'admin' } as Record<string, string>);
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'anything' });
    expect(res.status).toBe(401);
  });

  it('hash format is scrypt:<N>:<r>:<p>:<salt>:<hash> with explicit params', async () => {
    const h = await hashAdminPassword('test-format');
    expect(h.startsWith('scrypt:16384:8:1:')).toBe(true);
    expect(parseHash(h)).not.toBeNull();
  });
});
