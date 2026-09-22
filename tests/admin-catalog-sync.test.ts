import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import { loadConfig, resetConfig } from '../src/infrastructure/config/config.js';

const ADMIN_TOKEN = 'test-admin-token-1234567890123456';

function createMockCatalogSyncService() {
  return {
    sync: vi.fn(async () => ({
      status: 'completed',
      platforms: [],
      totals: { candidatesFound: 0, newGames: 0, existingGames: 0, updatedGames: 0, rejected: 0, errors: 0 },
      dryRun: false,
      durationMs: 123,
    })),
  };
}

function buildApp() {
  return createApp({
    games: { catalogService: { listGames: vi.fn(), searchGames: vi.fn(), getGameById: vi.fn() } as never },
    cover: { coverService: {} as never },
    platforms: { platformCatalogService: { listPlatforms: vi.fn(), getPlatformById: vi.fn() } as never },
    catalogSync: { catalogSyncService: createMockCatalogSyncService() as never },
    catalogSyncHistory: { historyRepository: { create: vi.fn(), update: vi.fn(), findById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })) } as never },
    admin: { gameAdminService: {} as never },
    adminCatalogSync: { catalogSyncService: createMockCatalogSyncService() as never },
  });
}

describe('Admin Catalog Sync — Fase 4B', () => {
  beforeEach(() => resetConfig());

  it('POST /api/v1/admin/catalog/sync without token → 401', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/catalog/sync').send({ activeOnly: true, from: '2025-01-01', to: '2025-12-31' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/v1/admin/catalog/sync invalid token → 401', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/catalog/sync').set('Authorization', 'Bearer wrong-token-1234567890123456').send({ activeOnly: true, from: '2025-01-01', to: '2025-12-31' });
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/admin/catalog/sync valid token → 200', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/catalog/sync').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ activeOnly: true, from: '2025-01-01', to: '2025-12-31' });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('completed');
  });

  it('POST /api/v1/admin/catalog/sync validates schema (missing from)', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    const res = await request(app).post('/api/v1/admin/catalog/sync').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ activeOnly: true, from: 'invalid', to: '2025-12-31' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('legacy POST /api/v1/catalog/sync now requires auth (Fase 4.14)', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    const res = await request(app).post('/api/v1/catalog/sync').send({ activeOnly: true, from: '2025-01-01', to: '2025-12-31' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    const authed = await request(app).post('/api/v1/catalog/sync').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ activeOnly: true, from: '2025-01-01', to: '2025-12-31' });
    expect(authed.status).toBe(200);
  });

  it('service reuse: admin route calls same CatalogSyncService', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const mock = createMockCatalogSyncService();
    const app = createApp({
      games: { catalogService: { listGames: vi.fn(), searchGames: vi.fn(), getGameById: vi.fn() } as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: { listPlatforms: vi.fn(), getPlatformById: vi.fn() } as never },
      catalogSync: { catalogSyncService: mock as never },
      catalogSyncHistory: { historyRepository: { create: vi.fn(), update: vi.fn(), findById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })) } as never },
      admin: { gameAdminService: {} as never },
      adminCatalogSync: { catalogSyncService: mock as never },
    });
    await request(app).post('/api/v1/admin/catalog/sync').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ activeOnly: true, from: '2025-01-01', to: '2025-12-31' });
    expect(mock.sync).toHaveBeenCalledWith(expect.objectContaining({ activeOnly: true, from: '2025-01-01', to: '2025-12-31', trigger: 'manual' }));
  });
});
