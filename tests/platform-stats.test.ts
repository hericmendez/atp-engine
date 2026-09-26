import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import { PlatformCatalogService } from '../src/application/platform-catalog-service.js';
import { loadConfig, resetConfig } from '../src/infrastructure/config/config.js';

function createMockRepo() {
  const all = [
    { id: 'ps5', name: 'PlayStation 5', company: 'Sony', releaseYear: 2020, status: 'active', family: 'PlayStation', type: 'console', thumb: null, gameCount: 10 },
    { id: 'ps4', name: 'PlayStation 4', company: 'Sony', releaseYear: 2013, status: 'active', family: 'PlayStation', type: 'console', thumb: null, gameCount: 0 },
    { id: 'snes', name: 'SNES', company: 'Nintendo', releaseYear: 1990, status: 'discontinued', family: 'Nintendo', type: 'console', thumb: null, gameCount: 5 },
    { id: 'ouya', name: 'Ouya', company: 'Ouya', releaseYear: 2013, status: 'discontinued', family: null, type: 'console', thumb: null, gameCount: 0 },
    { id: 'vapor', name: 'Vapor Platform', company: 'Test', releaseYear: 2025, status: 'inactive', family: null, type: 'computer', thumb: null, gameCount: 0 },
  ];
  return {
    findMany: vi.fn(async (q: { page?: number; limit?: number; status?: string; showEmpty?: boolean }) => {
      let items = [...all];
      if (q.status) items = items.filter((p) => p.status === q.status);
      if (q.showEmpty === false) items = items.filter((p) => p.gameCount > 0);
      const page = q.page ?? 1;
      const limit = Math.min(q.limit ?? 20, 100);
      const start = (page - 1) * limit;
      return { items: items.slice(start, start + limit), total: items.length, page, limit, totalPages: Math.ceil(items.length / limit) };
    }),
    findById: vi.fn(async (id: string) => all.find((p) => p.id === id) ?? null),
    findByCompany: vi.fn(async () => []),
    upsert: vi.fn(async () => {}),
    bulkUpsert: vi.fn(async () => ({ inserted: 0, updated: 0, errors: 0 })),
  } as unknown as import('../src/domain/platform/platform-catalog-repository.js').PlatformCatalogRepository;
}

function buildApp(service: PlatformCatalogService) {
  return createApp({
    games: { catalogService: { listGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' }) } as never },
    cover: { coverService: {} as never },
    platforms: { platformCatalogService: service },
    catalogSync: { catalogSyncService: {} as never },
    catalogSyncHistory: { historyRepository: {} as never },
    admin: { gameAdminService: {} as never },
  });
}

const EXPECTED = { total: 5, notEmpty: 2, empty: 3, byStatus: { active: 2, inactive: 1, discontinued: 2 } };

describe('GET /api/v1/platforms/summary stats', () => {
  beforeEach(() => {
    resetConfig();
    loadConfig({ ADMIN_API_TOKEN: 'test-token-1234567890123456' });
  });

  it('default response includes global stats', async () => {
    const app = buildApp(new PlatformCatalogService({ platformCatalogRepository: createMockRepo() }));
    const res = await request(app).get('/api/v1/platforms/summary');
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual(EXPECTED);
    expect(typeof res.body.stats.total).toBe('number');
    expect(res.body.stats.byStatus.inactive).toBe(1);
  });

  it('notEmpty + empty = total', async () => {
    const app = buildApp(new PlatformCatalogService({ platformCatalogRepository: createMockRepo() }));
    const res = await request(app).get('/api/v1/platforms/summary');
    expect(res.body.stats.notEmpty + res.body.stats.empty).toBe(res.body.stats.total);
  });

  it('filters do not change stats', async () => {
    const app = buildApp(new PlatformCatalogService({ platformCatalogRepository: createMockRepo() }));
    const base = await request(app).get('/api/v1/platforms/summary');
    for (const q of ['?platformStatus=active', '?showEmptyPlatforms=false', '?limit=1', '?companyName=Sony']) {
      const res = await request(app).get(`/api/v1/platforms/summary${q}`);
      expect(res.status).toBe(200);
      expect(res.body.stats).toEqual(base.body.stats);
    }
  });

  it('pagination does not change stats', async () => {
    const app = buildApp(new PlatformCatalogService({ platformCatalogRepository: createMockRepo() }));
    const p1 = await request(app).get('/api/v1/platforms/summary?limit=1&page=1');
    const p2 = await request(app).get('/api/v1/platforms/summary?limit=1&page=2');
    const full = await request(app).get('/api/v1/platforms/summary?limit=100');
    expect(p1.body.stats).toEqual(EXPECTED);
    expect(p2.body.stats).toEqual(EXPECTED);
    expect(full.body.stats).toEqual(EXPECTED);
    expect(p1.body.data).toHaveLength(1);
  });

  it('grouped summary includes global stats', async () => {
    const app = buildApp(new PlatformCatalogService({ platformCatalogRepository: createMockRepo() }));
    const res = await request(app).get('/api/v1/platforms/summary?groupByFamily=true');
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual(EXPECTED);
    expect(res.body.data.families).toBeDefined();
    expect(res.body.data.ungrouped).toBeDefined();
  });
});
