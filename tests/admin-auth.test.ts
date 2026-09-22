import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import type { CatalogService } from '../src/application/catalog-service.js';
import type { CoverService } from '../src/application/cover-service.js';
import type { PlatformCatalogService } from '../src/application/platform-catalog-service.js';
import type { GameQuery } from '../src/domain/game/game-repository.js';
import { loadConfig, resetConfig } from '../src/infrastructure/config/config.js';

const ADMIN_TOKEN = 'test-admin-token-123456';

function createMockCatalogService(): CatalogService {
  return {
    listGames: async (_query: GameQuery) => ({
      data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
      origin: 'database' as const,
    }),
    searchGames: async () => ({
      data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
      origin: 'database' as const,
    }),
    getGameById: async () => {
      throw new Error('Not implemented');
    },
  };
}

function createMockCoverService(): CoverService {
  return {
    searchCovers: async (q: string) => ({
      data: { query: q, gameId: null, type: 'cover' as const, limit: 1, selected: null, candidates: [], errors: [] },
      origin: 'scraper' as const,
    }),
    getGameCover: async (id: string) => ({
      data: { query: '', gameId: id, type: 'cover' as const, limit: 1, selected: null, candidates: [], errors: [] },
      origin: 'database' as const,
    }),
  } as CoverService;
}

function createMockPlatformCatalogService(): PlatformCatalogService {
  return {
    listPlatforms: async () => ({
      data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
      origin: 'database' as const,
    }),
    getPlatformById: async () => {
      throw new Error('Not implemented');
    },
  } as PlatformCatalogService;
}

function createMockCatalogSyncService() {
  return {
    sync: async () => ({
      status: 'completed' as const,
      platforms: [],
      totals: { candidatesFound: 0, newGames: 0, existingGames: 0, updatedGames: 0, rejected: 0, errors: 0 },
      dryRun: false,
      durationMs: 0,
    }),
  };
}

describe('admin boundary — Fase 1A', () => {
  beforeEach(() => {
    resetConfig();
  });

  function buildApp() {
    return createApp({
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
  }

  describe('GET /api/v1/admin/status — authentication', () => {
    it('returns 401 without Authorization header', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp();
      const res = await request(app).get('/api/v1/admin/status');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.requestId).toBeDefined();
    });

    it('returns 401 with invalid token', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/admin/status')
        .set('Authorization', 'Bearer wrong-token-value-123456');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with malformed Authorization (no Bearer prefix)', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/admin/status')
        .set('Authorization', ADMIN_TOKEN);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with empty Bearer token', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/admin/status')
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 with correct token', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/admin/status')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.admin).toBe(true);
      expect(res.body.timestamp).toBeDefined();
    });

    it('does not expose ADMIN_API_TOKEN in response body', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/admin/status')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(ADMIN_TOKEN);
    });

    it('does not expose ADMIN_API_TOKEN in 401 response body', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/admin/status')
        .set('Authorization', 'Bearer wrong-token-value-123456');
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(ADMIN_TOKEN);
      expect(body).not.toContain('wrong-token');
    });

    it('returns 401 when ADMIN_API_TOKEN not configured', async () => {
      loadConfig({});
      const app = buildApp();
      const res = await request(app)
        .get('/api/v1/admin/status')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('public routes remain public', () => {
    it('GET /health works without Authorization', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp();
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(['ok', 'degraded']).toContain(res.body.status);
    });

    it('GET /api/v1/games works without Authorization', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp();
      const res = await request(app).get('/api/v1/games?limit=1');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.pagination).toBeDefined();
    });
  });

  describe('ADMIN_API_TOKEN config validation', () => {
    it('rejects token shorter than 16 characters', () => {
      expect(() => loadConfig({ ADMIN_API_TOKEN: 'short' })).toThrow('Invalid environment configuration');
    });

    it('rejects token with 15 characters', () => {
      expect(() => loadConfig({ ADMIN_API_TOKEN: 'a'.repeat(15) })).toThrow('Invalid environment configuration');
    });

    it('accepts token with exactly 16 characters', () => {
      const config = loadConfig({ ADMIN_API_TOKEN: 'a'.repeat(16) });
      expect(config.ADMIN_API_TOKEN).toBe('a'.repeat(16));
    });

    it('accepts token longer than 16 characters', () => {
      const config = loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      expect(config.ADMIN_API_TOKEN).toBe(ADMIN_TOKEN);
    });

    it('allows undefined (not configured) without error', () => {
      const config = loadConfig({});
      expect(config.ADMIN_API_TOKEN).toBeUndefined();
    });
  });
});
