import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import type { CatalogService } from '../src/application/catalog-service.js';
import type { CoverService } from '../src/application/cover-service.js';
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

describe('app', () => {
  const app = createApp({
    games: { catalogService: createMockCatalogService() },
    cover: { coverService: createMockCoverService() },
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
