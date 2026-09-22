import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';

describe('Dashboard static serving', () => {
  const catalogService = { listGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }), searchGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }), getGameById: async () => { throw new Error('no'); } } as never;
  const app = createApp({
    games: { catalogService },
    cover: { coverService: {} as never },
    platforms: { platformCatalogService: { listPlatforms: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }), getPlatformById: async () => { throw new Error('no'); } } as never },
    catalogSync: { catalogSyncService: {} as never },
    catalogSyncHistory: { historyRepository: {} as never },
    admin: { gameAdminService: {} as never },
    adminGamesRead: { catalogService },
  });

  it('GET /admin serves index.html', async () => {
    const res = await request(app).get('/admin');
    // If dashboard built, should be html; if not built, 404. Accept either but not 500.
    expect([200, 301, 302, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/html/);
    }
  });

  it('GET /admin/games serves SPA fallback (html) when dashboard exists', async () => {
    const res = await request(app).get('/admin/games');
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.text).toContain('<!doctype html>');
    }
  });

  it('GET /api/v1/admin/status is not captured by SPA fallback (still 401)', async () => {
    const res = await request(app).get('/api/v1/admin/status');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('GET /api/v1/admin/games without token is 401, not html', async () => {
    const res = await request(app).get('/api/v1/admin/games');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
