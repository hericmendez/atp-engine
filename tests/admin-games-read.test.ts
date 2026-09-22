import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import type { Game } from '../src/domain/game/game.js';
import { createGameId } from '../src/domain/shared/ids.js';
import { createGameTitle } from '../src/domain/shared/title.js';
import { createOrganization } from '../src/domain/shared/organization.js';
import { createGenre } from '../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../src/domain/shared/external-identifier.js';
import type { CatalogService } from '../src/application/catalog-service.js';
import type { GameQuery, PaginatedResult } from '../src/domain/game/game-repository.js';
import { loadConfig, resetConfig } from '../src/infrastructure/config/config.js';

const ADMIN_TOKEN = 'test-admin-token-123456';

/* ---------- Helpers to build Game fixtures matching spec ---------- */

function makeGame(over: Partial<Game> & { id: string }): Game {
  return {
    id: createGameId(over.id),
    titles: over.titles ?? [createGameTitle(over.id, 'primary')],
    releases: over.releases ?? [],
    developers: over.developers ?? [],
    publishers: over.publishers ?? [],
    genres: over.genres ?? [],
    externalIdentifiers: over.externalIdentifiers ?? [],
    relationships: over.relationships ?? [],
    evidence: over.evidence ?? [],
    classification: over.classification ?? 'GAME',
    completeness: over.completeness ?? 'FOUND_COMPLETE',
    cover: over.cover ?? null,
    lastEnrichedAt: over.lastEnrichedAt ?? null,
    gameType: over.gameType ?? null,
    gameStatus: over.gameStatus ?? null,
    description: over.description ?? null,
    createdAt: over.createdAt,
    updatedAt: over.updatedAt,
  } as Game;
}

// Game A: cover + description + dev + pub
// Game B: no cover + description + dev + pub
// Game C: cover + no description + no dev + pub
// Game D: no cover + no description + no dev + no pub
const FIXTURE_GAMES: Game[] = [
  makeGame({
    id: 'atp-igdb-1',
    titles: [createGameTitle('Game A', 'primary')],
    cover: { url: 'https://cdn.example/a.jpg', source: 'igdb', sourceId: '1', width: 200, height: 300, type: 'unknown' as never },
    description: 'Description A',
    developers: [createOrganization('Dev A')],
    publishers: [createOrganization('Pub A')],
    genres: [createGenre('Action')],
    externalIdentifiers: [createExternalIdentifier('igdb', '1')],
    classification: 'GAME',
    releases: [
      {
        id: 'rel-a' as never,
        gameId: createGameId('atp-igdb-1'),
        platform: { name: 'PC', family: null, type: 'computer' as never },
        region: null,
        releaseDate: { year: 2020, month: 1, day: 1, precision: 'day' as never },
        version: null,
        edition: null,
        distributionChannels: [],
        launchers: [],
        externalIdentifiers: [],
        evidence: [],
      } as never,
    ],
  }),
  makeGame({
    id: 'atp-igdb-2',
    titles: [createGameTitle('Game B', 'primary')],
    cover: null,
    description: 'Description B',
    developers: [createOrganization('Dev B')],
    publishers: [createOrganization('Pub B')],
    externalIdentifiers: [createExternalIdentifier('igdb', '2')],
  }),
  makeGame({
    id: 'atp-igdb-3',
    titles: [createGameTitle('Game C', 'primary')],
    cover: { url: 'https://cdn.example/c.jpg', source: 'igdb', sourceId: '3', width: 200, height: 300, type: 'unknown' as never },
    description: null,
    developers: [],
    publishers: [createOrganization('Pub C')],
    externalIdentifiers: [createExternalIdentifier('igdb', '3')],
  }),
  makeGame({
    id: 'atp-igdb-4',
    titles: [createGameTitle('Game D', 'primary')],
    cover: null,
    description: '   ', // whitespace only → considered empty
    developers: [],
    publishers: [],
    externalIdentifiers: [createExternalIdentifier('igdb', '4')],
  }),
];

function createFakeCatalogService(games: Game[] = FIXTURE_GAMES): CatalogService {
  return {
    listGames: async (query: GameQuery): Promise<{ data: PaginatedResult<Game>; origin: 'database' }> => {
      let filtered = [...games];

      if (query.search) {
        const s = query.search.toLowerCase();
        filtered = filtered.filter((g) => g.titles.some((t) => t.value.toLowerCase().includes(s)));
      }
      if (query.title) {
        const t = query.title.toLowerCase();
        filtered = filtered.filter((g) => g.titles.some((x) => x.value.toLowerCase().includes(t)));
      }
      if (query.platform) {
        const p = query.platform.toLowerCase();
        filtered = filtered.filter((g) => g.releases.some((r) => r.platform.name.toLowerCase().includes(p)));
      }
      if (query.classification) filtered = filtered.filter((g) => g.classification === query.classification);
      if (query.completeness) filtered = filtered.filter((g) => g.completeness === query.completeness);
      if (query.releaseYear) filtered = filtered.filter((g) => g.releases.some((r) => r.releaseDate?.year === query.releaseYear));
      if (query.releaseYearFrom !== undefined) filtered = filtered.filter((g) => g.releases.some((r) => (r.releaseDate?.year ?? 0) >= query.releaseYearFrom!));
      if (query.releaseYearTo !== undefined) filtered = filtered.filter((g) => g.releases.some((r) => (r.releaseDate?.year ?? 0) <= query.releaseYearTo!));

      // hasCover
      if (query.hasCover === true) filtered = filtered.filter((g) => g.cover !== null);
      if (query.hasCover === false) filtered = filtered.filter((g) => g.cover === null);

      // hasDescription: true => /\S/, false => null/empty/whitespace
      if (query.hasDescription === true) filtered = filtered.filter((g) => typeof g.description === 'string' && /\S/.test(g.description));
      if (query.hasDescription === false) filtered = filtered.filter((g) => g.description === null || g.description === undefined || !/\S/.test(g.description));

      // hasDevelopers: true => developers.0 exists
      if (query.hasDevelopers === true) filtered = filtered.filter((g) => g.developers.length > 0);
      if (query.hasDevelopers === false) filtered = filtered.filter((g) => g.developers.length === 0);

      if (query.hasPublishers === true) filtered = filtered.filter((g) => g.publishers.length > 0);
      if (query.hasPublishers === false) filtered = filtered.filter((g) => g.publishers.length === 0);

      if (query.needsCover === true) filtered = filtered.filter((g) => g.cover === null);
      if (query.needsCompanies === true) filtered = filtered.filter((g) => g.developers.length === 0 || g.publishers.length === 0);

      // sorting
      if (query.sort) {
        const dir = query.sort.direction === 'desc' ? -1 : 1;
        const field = query.sort.field;
        filtered.sort((a, b) => {
          if (field === 'title' || field === 'name') return dir * a.titles[0].value.localeCompare(b.titles[0].value);
          if (field === 'domainId') return dir * a.id.localeCompare(b.id);
          if (field === 'createdAt') return dir * (a.createdAt?.getTime() ?? 0 - (b.createdAt?.getTime() ?? 0));
          if (field === 'updatedAt') return dir * (a.updatedAt?.getTime() ?? 0 - (b.updatedAt?.getTime() ?? 0));
          return 0;
        });
      }

      const page = query.page ?? 1;
      const limit = Math.min(query.limit ?? 20, 100);
      const total = filtered.length;
      const start = (page - 1) * limit;
      const items = filtered.slice(start, start + limit);
      return { data: { items, total, page, limit, totalPages: Math.ceil(total / limit) }, origin: 'database' as const };
    },
    searchGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }),
    getGameById: async (id: string) => {
      const g = games.find((x) => x.id === id);
      if (!g) throw new (await import('../src/shared/errors/errors.js')).NotFoundError(`Game with ID ${id} not found`);
      return { data: g, origin: 'database' as const };
    },
  };
}

function createMockCoverService() {
  return { searchCovers: vi.fn(), getGameCover: vi.fn() } as unknown as import('../src/application/cover-service.js').CoverService;
}
function createMockPlatformService() {
  return { listPlatforms: vi.fn(async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const })), getPlatformById: vi.fn() } as unknown as import('../src/application/platform-catalog-service.js').PlatformCatalogService;
}

function buildApp(catalogService: CatalogService) {
  return createApp({
    games: { catalogService },
    cover: { coverService: createMockCoverService() },
    platforms: { platformCatalogService: createMockPlatformService() },
    catalogSync: { catalogSyncService: {} as never },
    catalogSyncHistory: { historyRepository: {} as never },
    admin: { gameAdminService: { createGame: vi.fn(), updateGame: vi.fn(), deleteGame: vi.fn() } as never },
    adminGamesRead: { catalogService },
  });
}

describe('Admin Games Read Model — Fase 1D', () => {
  beforeEach(() => resetConfig());

  describe('Autenticação', () => {
    it('GET /api/v1/admin/games sem token → 401', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/admin/games token inválido → 401', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games').set('Authorization', 'Bearer wrong-1234567890123456');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/admin/games token válido → 200', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.pagination).toBeDefined();
    });

    it('GET /api/v1/admin/games/:id sem token → 401', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games/atp-igdb-1');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/admin/games/:id token válido → 200', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games/atp-igdb-1').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('atp-igdb-1');
    });
  });

  describe('Listagem básica', () => {
    it('listagem básica retorna todos com paginação', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(4);
      expect(res.body.pagination.total).toBe(4);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.origin).toBe('database');
    });

    it('paginação page/limit', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const p1 = await request(app).get('/api/v1/admin/games?page=1&limit=2').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(p1.body.data).toHaveLength(2);
      expect(p1.body.pagination.total).toBe(4);
      expect(p1.body.pagination.totalPages).toBe(2);
      const p2 = await request(app).get('/api/v1/admin/games?page=2&limit=2').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(p2.body.data).toHaveLength(2);
    });

    it('limit respeita max 100', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?limit=200').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('search filtra', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?search=Game%20A').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.some((g: Game) => g.id === 'atp-igdb-1')).toBe(true);
    });

    it('platform filtra', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?platform=PC').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe('atp-igdb-1');
    });

    it('classification filtra', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?classification=GAME').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data).toHaveLength(4);
    });

    it('releaseYear filtra', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?releaseYear=2020').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('atp-igdb-1');
    });

    it('needsCover filtra', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?needsCover=true').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.every((g: Game) => g.cover === null)).toBe(true);
      expect(res.body.data).toHaveLength(2); // B,D
    });

    it('needsCompanies filtra', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?needsCompanies=true').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data).toHaveLength(2); // C,D
    });

    it('sorting title asc funciona', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?sort=title&order=asc&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      const titles = res.body.data.map((g: { titles: { value: string }[] }) => g.titles[0].value);
      expect(titles).toEqual([...titles].sort((a: string, b: string) => a.localeCompare(b)));
    });

    it('sorting domainId funciona (admin específico)', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const asc = await request(app).get('/api/v1/admin/games?sort=domainId&order=asc&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(asc.body.data.map((g: Game) => g.id)).toEqual(['atp-igdb-1', 'atp-igdb-2', 'atp-igdb-3', 'atp-igdb-4']);
      const desc = await request(app).get('/api/v1/admin/games?sort=domainId&order=desc&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(desc.body.data.map((g: Game) => g.id)).toEqual(['atp-igdb-4', 'atp-igdb-3', 'atp-igdb-2', 'atp-igdb-1']);
    });
  });

  describe('Cobertura has*', () => {
    it('hasCover=true → A,C', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?hasCover=true&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.map((g: Game) => g.id).sort()).toEqual(['atp-igdb-1', 'atp-igdb-3']);
    });

    it('hasCover=false → B,D', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?hasCover=false&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.map((g: Game) => g.id).sort()).toEqual(['atp-igdb-2', 'atp-igdb-4']);
    });

    it('hasDescription=true → A,B (C null, D whitespace)', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?hasDescription=true&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.map((g: Game) => g.id).sort()).toEqual(['atp-igdb-1', 'atp-igdb-2']);
    });

    it('hasDescription=false → C,D', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?hasDescription=false&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.map((g: Game) => g.id).sort()).toEqual(['atp-igdb-3', 'atp-igdb-4']);
    });

    it('hasDevelopers=true → A,B', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?hasDevelopers=true&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.map((g: Game) => g.id).sort()).toEqual(['atp-igdb-1', 'atp-igdb-2']);
    });

    it('hasDevelopers=false → C,D', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?hasDevelopers=false&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.map((g: Game) => g.id).sort()).toEqual(['atp-igdb-3', 'atp-igdb-4']);
    });

    it('hasPublishers=true → A,B,C', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?hasPublishers=true&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.map((g: Game) => g.id).sort()).toEqual(['atp-igdb-1', 'atp-igdb-2', 'atp-igdb-3']);
    });

    it('hasPublishers=false → D', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?hasPublishers=false&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.map((g: Game) => g.id)).toEqual(['atp-igdb-4']);
    });

    it('combinação hasCover=false & hasDescription=false → D', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games?hasCover=false&hasDescription=false&limit=100').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.map((g: Game) => g.id)).toEqual(['atp-igdb-4']);
    });
  });

  describe('Detail', () => {
    it('Game existente → 200 com campos operacionais', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games/atp-igdb-1').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('atp-igdb-1');
      expect(res.body.data.titles).toBeDefined();
      expect(res.body.data.cover).toBeDefined();
      expect(res.body.data.description).toBeDefined();
      expect(res.body.data.developers).toBeDefined();
      expect(res.body.data.publishers).toBeDefined();
      expect(res.body.data.genres).toBeDefined();
      expect(res.body.data.releases).toBeDefined();
      expect(res.body.data.classification).toBeDefined();
      expect(res.body.data.externalIdentifiers).toBeDefined();
      expect(res.body.data.evidence).toBeDefined();
      expect(res.body.origin).toBe('database');
      // admin fields
      expect(res.body.data).toHaveProperty('gameType');
      expect(res.body.data).toHaveProperty('gameStatus');
      expect(res.body.data).toHaveProperty('lastEnrichedAt');
      // no secrets
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('ADMIN_API_TOKEN');
      expect(bodyStr).not.toContain('mongodb');
    });

    it('Game inexistente → 404', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games/nonexistent-id').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.requestId).toBeDefined();
    });

    it('ID inválido (whitespace) → 400 VALIDATION_ERROR', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games/%20%20%20').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('não vaza ADMIN_API_TOKEN em erro 404', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/admin/games/atp-igdb-missing').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(JSON.stringify(res.body)).not.toContain(ADMIN_TOKEN);
    });
  });

  describe('Regressão', () => {
    it('POST /api/v1/admin/games agora exige auth (Fase 4.14)', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).post('/api/v1/admin/games').send({ titles: [{ value: 'Test' }] });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      const authed = await request(app).post('/api/v1/admin/games').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ titles: [] });
      expect(authed.status).toBe(400);
      expect(authed.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('PATCH /api/v1/admin/games/:id agora exige auth', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).patch('/api/v1/admin/games/atp-igdb-1').send({ titles: [{ value: 'New' }] });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/games público continua funcionando', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/api/v1/games?limit=1');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('GET /health público continua', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const app = buildApp(createFakeCatalogService());
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/enrichment/jobs público continua', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      // need enrichmentJobs repo for public route
      const fakeRepo = { findRecent: async () => [], findRecentByType: async () => [], findById: async () => null, requestPause: async () => ({ requested: false, job: null }), tryAcquireLease: async () => ({ acquired: false, job: null }) } as never;
      const app2 = createApp({
        games: { catalogService: createFakeCatalogService() as never },
        cover: { coverService: createMockCoverService() },
        platforms: { platformCatalogService: createMockPlatformService() },
        catalogSync: { catalogSyncService: {} as never },
        catalogSyncHistory: { historyRepository: {} as never },
        admin: { gameAdminService: {} as never },
        enrichmentJobs: { jobRepository: fakeRepo },
        adminEnrichmentJobs: { jobRepository: fakeRepo },
        adminGamesRead: { catalogService: createFakeCatalogService() as never },
      });
      const res = await request(app2).get('/api/v1/enrichment/jobs');
      expect(res.status).toBe(200);
    });
  });
});
