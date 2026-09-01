import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CatalogSyncHistoryRepository } from '../../src/application/catalog-sync-history-repository.js';
import type { CatalogSyncHistory } from '../../src/application/catalog-sync-history-types.js';

function createMockHistoryRepository(): CatalogSyncHistoryRepository & {
  store: Map<string, CatalogSyncHistory>;
} {
  const store = new Map<string, CatalogSyncHistory>();
  let nextId = 1;

  return {
    store,
    create: vi.fn(async (entry: Omit<CatalogSyncHistory, 'id'>): Promise<string> => {
      const id = `history-${nextId++}`;
      const record = { ...entry, id } as CatalogSyncHistory;
      store.set(id, record);
      return id;
    }),
    update: vi.fn(async (id: string, updates: Partial<CatalogSyncHistory>): Promise<void> => {
      const existing = store.get(id);
      if (!existing) throw new Error(`Not found: ${id}`);
      store.set(id, { ...existing, ...updates } as CatalogSyncHistory);
    }),
    findById: vi.fn(async (id: string): Promise<CatalogSyncHistory | null> => {
      return store.get(id) ?? null;
    }),
    findMany: vi.fn(
      async (
        query,
      ): Promise<{
        items: readonly CatalogSyncHistory[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }> => {
        let items = [...store.values()];

        if (query.status) {
          items = items.filter((i) => i.status === query.status);
        }
        if (query.trigger) {
          items = items.filter((i) => i.trigger === query.trigger);
        }

        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const start = (page - 1) * limit;
        const paged = items.slice(start, start + limit);

        return {
          items: paged,
          total: items.length,
          page,
          limit,
          totalPages: Math.ceil(items.length / limit),
        };
      },
    ),
  };
}

function createTestHistory(
  overrides: Partial<CatalogSyncHistory> = {},
): Omit<CatalogSyncHistory, 'id'> {
  return {
    startedAt: overrides.startedAt ?? new Date('2025-09-01T10:00:00Z'),
    completedAt: overrides.completedAt ?? new Date('2025-09-01T10:01:00Z'),
    trigger: overrides.trigger ?? 'manual',
    status: overrides.status ?? 'completed',
    dryRun: overrides.dryRun ?? false,
    from: overrides.from ?? '2025-01-01',
    to: overrides.to ?? '2025-12-31',
    requestedPlatformIds: overrides.requestedPlatformIds ?? ['nintendo-switch'],
    resolvedPlatformNames: overrides.resolvedPlatformNames ?? ['Nintendo Switch'],
    totals: overrides.totals ?? {
      candidatesFound: 10,
      newGames: 5,
      existingGames: 3,
      updatedGames: 1,
      rejected: 1,
      errors: 0,
    },
    platformResults: overrides.platformResults ?? [
      {
        platformId: 'nintendo-switch',
        platformName: 'Nintendo Switch',
        candidatesFound: 10,
        newGames: 5,
        existingGames: 3,
        updatedGames: 1,
        rejected: 1,
        errors: 0,
        status: 'completed',
      },
    ],
    error: overrides.error ?? null,
    durationMs: overrides.durationMs ?? 60000,
  };
}

describe('CatalogSyncHistoryRepository', () => {
  let repo: ReturnType<typeof createMockHistoryRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createMockHistoryRepository();
  });

  describe('create()', () => {
    it('creates a history record and returns id', async () => {
      const entry = createTestHistory();
      const id = await repo.create(entry);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(repo.store.size).toBe(1);
    });

    it('stores all fields correctly', async () => {
      const entry = createTestHistory({ trigger: 'scheduled', dryRun: true });
      const id = await repo.create(entry);

      const stored = repo.store.get(id);
      expect(stored).toBeDefined();
      expect(stored!.trigger).toBe('scheduled');
      expect(stored!.dryRun).toBe(true);
    });
  });

  describe('findById()', () => {
    it('returns record when found', async () => {
      const entry = createTestHistory();
      const id = await repo.create(entry);

      const found = await repo.findById(id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(id);
      expect(found!.status).toBe('completed');
    });

    it('returns null when not found', async () => {
      const found = await repo.findById('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('update()', () => {
    it('updates record fields', async () => {
      const entry = createTestHistory({ status: 'running' });
      const id = await repo.create(entry);

      await repo.update(id, { status: 'completed', completedAt: new Date() });

      const updated = repo.store.get(id);
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).toBeInstanceOf(Date);
    });

    it('throws when record not found', async () => {
      await expect(repo.update('nonexistent', { status: 'completed' })).rejects.toThrow();
    });
  });

  describe('findMany()', () => {
    it('returns paginated results', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.create(createTestHistory({ trigger: i % 2 === 0 ? 'manual' : 'scheduled' }));
      }

      const result = await repo.findMany({ page: 1, limit: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.totalPages).toBe(3);
    });

    it('filters by status', async () => {
      await repo.create(createTestHistory({ status: 'completed' }));
      await repo.create(createTestHistory({ status: 'failed' }));

      const result = await repo.findMany({ status: 'failed' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('failed');
    });

    it('filters by trigger', async () => {
      await repo.create(createTestHistory({ trigger: 'manual' }));
      await repo.create(createTestHistory({ trigger: 'scheduled' }));

      const result = await repo.findMany({ trigger: 'scheduled' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].trigger).toBe('scheduled');
    });

    it('returns empty array when no records match', async () => {
      const result = await repo.findMany({});
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});

describe('GET /api/v1/catalog/sync/history', () => {
  let app: ReturnType<typeof import('../../src/interfaces/http/app.js').createApp>;
  let mockHistoryRepo: ReturnType<typeof createMockHistoryRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHistoryRepo = createMockHistoryRepository();

    const { createApp } = await import('../../src/interfaces/http/app.js');
    app = createApp({
      games: {
        catalogService: {
          listGames: async () => ({
            data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
            origin: 'database',
          }),
          searchGames: async () => ({
            data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
            origin: 'database',
          }),
          getGameById: async () => {
            throw new Error('Not implemented');
          },
        },
      },
      cover: {
        coverService: {
          searchCovers: async () => ({
            data: {
              query: '',
              gameId: null,
              type: 'cover',
              limit: 1,
              selected: null,
              candidates: [],
              errors: [],
            },
            origin: 'scraper',
          }),
          getGameCover: async () => ({
            data: {
              query: '',
              gameId: '',
              type: 'cover',
              limit: 1,
              selected: null,
              candidates: [],
              errors: [],
            },
            origin: 'database',
          }),
        },
      },
      platforms: {
        platformCatalogService: {
          listPlatforms: async () => ({
            data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
            origin: 'database',
          }),
          getPlatformById: async () => {
            throw new Error('Not implemented');
          },
        },
      },
      catalogSync: {
        catalogSyncService: { sync: vi.fn() } as never,
      },
      catalogSyncHistory: { historyRepository: mockHistoryRepo },
    });
  });

  it('returns empty list when no history exists', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/v1/catalog/sync/history');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toBeDefined();
  });

  it('returns history records', async () => {
    await mockHistoryRepo.create(createTestHistory());
    await mockHistoryRepo.create(createTestHistory({ trigger: 'scheduled' }));

    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/v1/catalog/sync/history');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('supports pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await mockHistoryRepo.create(createTestHistory());
    }

    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/v1/catalog/sync/history?page=1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
  });

  it('filters by status', async () => {
    await mockHistoryRepo.create(createTestHistory({ status: 'completed' }));
    await mockHistoryRepo.create(createTestHistory({ status: 'failed' }));

    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/v1/catalog/sync/history?status=failed');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe('failed');
  });

  it('filters by trigger', async () => {
    await mockHistoryRepo.create(createTestHistory({ trigger: 'manual' }));
    await mockHistoryRepo.create(createTestHistory({ trigger: 'scheduled' }));

    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/v1/catalog/sync/history?trigger=scheduled');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].trigger).toBe('scheduled');
  });

  it('returns 400 for invalid status', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/v1/catalog/sync/history?status=invalid');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/catalog/sync/history/:id', () => {
  let app: ReturnType<typeof import('../../src/interfaces/http/app.js').createApp>;
  let mockHistoryRepo: ReturnType<typeof createMockHistoryRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockHistoryRepo = createMockHistoryRepository();

    const { createApp } = await import('../../src/interfaces/http/app.js');
    app = createApp({
      games: {
        catalogService: {
          listGames: async () => ({
            data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
            origin: 'database',
          }),
          searchGames: async () => ({
            data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
            origin: 'database',
          }),
          getGameById: async () => {
            throw new Error('Not implemented');
          },
        },
      },
      cover: {
        coverService: {
          searchCovers: async () => ({
            data: {
              query: '',
              gameId: null,
              type: 'cover',
              limit: 1,
              selected: null,
              candidates: [],
              errors: [],
            },
            origin: 'scraper',
          }),
          getGameCover: async () => ({
            data: {
              query: '',
              gameId: '',
              type: 'cover',
              limit: 1,
              selected: null,
              candidates: [],
              errors: [],
            },
            origin: 'database',
          }),
        },
      },
      platforms: {
        platformCatalogService: {
          listPlatforms: async () => ({
            data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
            origin: 'database',
          }),
          getPlatformById: async () => {
            throw new Error('Not implemented');
          },
        },
      },
      catalogSync: {
        catalogSyncService: { sync: vi.fn() } as never,
      },
      catalogSyncHistory: { historyRepository: mockHistoryRepo },
    });
  });

  it('returns a specific history record', async () => {
    const id = await mockHistoryRepo.create(createTestHistory());

    const request = (await import('supertest')).default;
    const res = await request(app).get(`/api/v1/catalog/sync/history/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(id);
    expect(res.body.data.status).toBe('completed');
  });

  it('returns 404 for nonexistent id', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/v1/catalog/sync/history/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns list when trailing slash (matches list endpoint)', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/v1/catalog/sync/history/');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
