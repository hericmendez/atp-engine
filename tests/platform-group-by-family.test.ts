import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import { PlatformCatalogService } from '../src/application/platform-catalog-service.js';
import { loadConfig, resetConfig } from '../src/infrastructure/config/config.js';

function createMockRepo() {
  const all = [
    { id: 'ps5', name: 'PlayStation 5', company: 'Sony', releaseYear: 2020, status: 'active', family: 'PlayStation', type: 'console', thumb: null, gameCount: 10 },
    { id: 'ps4', name: 'PlayStation 4', company: 'Sony', releaseYear: 2013, status: 'active', family: 'PlayStation', type: 'console', thumb: null, gameCount: 5 },
    { id: 'switch', name: 'Nintendo Switch', company: 'Nintendo', releaseYear: 2017, status: 'active', family: 'Nintendo', type: 'console', thumb: null, gameCount: 8 },
    { id: 'pc', name: 'PC', company: 'Various', releaseYear: null, status: 'active', family: null, type: 'computer', thumb: null, gameCount: 100 },
    { id: 'empty', name: 'Empty Platform', company: 'Test', releaseYear: 2000, status: 'active', family: '', type: 'console', thumb: null, gameCount: 0 },
  ];
  return {
    findMany: vi.fn(async (q: { page?: number; limit?: number }) => {
      // Simple mock that respects limit/page but for grouped we return all
      const page = q.page ?? 1;
      const limit = q.limit ?? 20;
      const start = (page - 1) * limit;
      const items = all.slice(start, start + limit);
      return { items, total: all.length, page, limit, totalPages: Math.ceil(all.length / limit) };
    }),
    findById: vi.fn(async (id: string) => all.find((p) => p.id === id) ?? null),
    findByCompany: vi.fn(async () => []),
    upsert: vi.fn(async () => {}),
    bulkUpsert: vi.fn(async () => ({ inserted: 0, updated: 0, errors: 0 })),
  } as unknown as import('../src/domain/platform/platform-catalog-repository.js').PlatformCatalogRepository;
}

describe('GET /api/v1/platforms/summary?groupByFamily', () => {
  beforeEach(() => {
    resetConfig();
    loadConfig({ ADMIN_API_TOKEN: 'test-token-1234567890123456' });
  });

  it('normal mode still array', async () => {
    const repo = createMockRepo();
    const service = new PlatformCatalogService({ platformCatalogRepository: repo });
    const app = createApp({
      games: { catalogService: { listGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' }) } as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: service },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
    });
    const res = await request(app).get('/api/v1/platforms/summary');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination.total).toBe(5);
  });

  it('groupByFamily=true returns families and ungrouped', async () => {
    const repo = createMockRepo();
    const service = new PlatformCatalogService({ platformCatalogRepository: repo });
    const app = createApp({
      games: { catalogService: { listGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' }) } as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: service },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
    });
    const res = await request(app).get('/api/v1/platforms/summary?groupByFamily=true');
    expect(res.status).toBe(200);
    expect(res.body.data.families).toBeDefined();
    expect(res.body.data.ungrouped).toBeDefined();
    expect(res.body.data.families.length).toBe(2); // PlayStation, Nintendo
    expect(res.body.data.families[0].name).toBe('Nintendo');
    expect(res.body.data.families[1].name).toBe('PlayStation');
    expect(res.body.data.families[1].platforms.map((p: { name: string }) => p.name)).toEqual(['PlayStation 4', 'PlayStation 5']);
    expect(res.body.data.ungrouped.map((p: { name: string }) => p.name).sort()).toEqual(['Empty Platform', 'PC']);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(5);
  });

  it('no duplicate', async () => {
    const repo = createMockRepo();
    const service = new PlatformCatalogService({ platformCatalogRepository: repo });
    const app = createApp({
      games: { catalogService: { listGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' }) } as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: service },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
    });
    const res = await request(app).get('/api/v1/platforms/summary?groupByFamily=true');
    const allIds = [...res.body.data.families.flatMap((f: { platforms: { id: string }[] }) => f.platforms.map((p) => p.id)), ...res.body.data.ungrouped.map((p: { id: string }) => p.id)];
    expect(allIds.length).toBe(5);
    expect(new Set(allIds).size).toBe(5);
  });

  it('groupByFamily=false keeps normal', async () => {
    const repo = createMockRepo();
    const service = new PlatformCatalogService({ platformCatalogRepository: repo });
    const app = createApp({
      games: { catalogService: { listGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' }) } as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: service },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
    });
    const res = await request(app).get('/api/v1/platforms/summary?groupByFamily=false');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('pagination ignored when grouped', async () => {
    const repo = createMockRepo();
    const service = new PlatformCatalogService({ platformCatalogRepository: repo });
    const app = createApp({
      games: { catalogService: { listGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' }) } as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: service },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
    });
    const res = await request(app).get('/api/v1/platforms/summary?groupByFamily=true&page=2&limit=1');
    expect(res.body.data.families.length).toBe(2);
    expect(res.body.pagination.total).toBe(5);
  });
});
