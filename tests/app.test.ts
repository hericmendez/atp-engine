import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import type { CatalogService } from '../src/application/catalog-service.js';
import type { CoverService } from '../src/application/cover-service.js';
import type { PlatformCatalogService } from '../src/application/platform-catalog-service.js';
import type { GameQuery } from '../src/domain/game/game-repository.js';

function createMockCatalogService(): CatalogService {
  return {
    listGames: async (_query: GameQuery) => ({
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      },
      origin: 'database' as const,
    }),
    searchGames: async (
      _query: string,
      _options?: { page?: number; limit?: number; sort?: GameQuery['sort'] },
    ) => ({
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      },
      origin: 'database' as const,
    }),
    getGameById: async (_id: string) => {
      throw new Error('Not implemented');
    },
  };
}

function createMockCoverService(): CoverService {
  return {
    searchCovers: async (_query: string) => ({
      data: {
        query: _query,
        gameId: null,
        type: 'cover' as const,
        limit: 1,
        selected: null,
        candidates: [],
        errors: [],
      },
      origin: 'scraper' as const,
    }),
    getGameCover: async (_gameId: string) => ({
      data: {
        query: '',
        gameId: _gameId,
        type: 'cover' as const,
        limit: 1,
        selected: null,
        candidates: [],
        errors: [],
      },
      origin: 'database' as const,
    }),
  } as CoverService;
}

function createMockPlatformCatalogService(): PlatformCatalogService {
  return {
    listPlatforms: async () => ({
      data: {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      },
      origin: 'database' as const,
    }),
    getPlatformById: async (_id: string) => {
      throw new Error('Not implemented');
    },
  } as PlatformCatalogService;
}

function createMockCatalogSyncService() {
  return {
    sync: async () => ({
      status: 'completed',
      platforms: [],
      totals: {
        candidatesFound: 0,
        newGames: 0,
        existingGames: 0,
        updatedGames: 0,
        rejected: 0,
        errors: 0,
      },
      dryRun: false,
      durationMs: 0,
    }),
  };
}

describe('app', () => {
  const app = createApp({
    games: { catalogService: createMockCatalogService() },
    cover: { coverService: createMockCoverService() },
    platforms: { platformCatalogService: createMockPlatformCatalogService() },
    catalogSync: { catalogSyncService: createMockCatalogSyncService() },
    catalogSyncHistory: {
      historyRepository: {
        create: vi.fn(),
        update: vi.fn(),
        findById: vi.fn(),
        findMany: vi.fn(),
      } as never,
    },
    admin: { gameAdminService: {} as never },
  });

  it('creates an express application', () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });

  it('responds to GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(['ok', 'degraded']).toContain(res.body.status);
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.uptime).toBeDefined();
    expect(res.body.dependencies).toBeDefined();
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/unknown');
    expect(res.status).toBe(404);
  });

  it('returns validation error for invalid JSON body', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{invalid json');
    expect(res.status).toBe(400);
  });
});
