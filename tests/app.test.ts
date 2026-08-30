import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import type { CatalogService } from '../src/application/catalog-service.js';
import type { CoverService } from '../src/application/cover-service.js';
import type { GameQuery, PaginatedResult } from '../src/domain/game/game-repository.js';
import type { Game } from '../src/domain/game/game.js';
import type { CoverResult } from '../src/domain/cover/cover-candidate.js';

function createMockCatalogService(): CatalogService {
  return {
    listGames: async (_query: GameQuery): Promise<PaginatedResult<Game>> => ({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    }),
    searchGames: async (
      _query: string,
      _options?: { page?: number; limit?: number; sort?: GameQuery['sort'] },
    ): Promise<PaginatedResult<Game>> => ({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    }),
    getGameById: async (_id: string): Promise<Game> => {
      throw new Error('Not implemented');
    },
  };
}

function createMockCoverService(): CoverService {
  return {
    searchCovers: async (_query: string): Promise<CoverResult> => ({
      query: _query,
      gameId: null,
      selected: null,
      candidates: [],
      errors: [],
    }),
    getGameCover: async (_gameId: string): Promise<CoverResult> => ({
      query: '',
      gameId: _gameId,
      selected: null,
      candidates: [],
      errors: [],
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
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
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
