import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/interfaces/http/app.js';
import type { CatalogService } from '../../src/application/catalog-service.js';
import type { GameQuery } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createPlatform } from '../../src/domain/shared/platform.js';
import { createReleaseId } from '../../src/domain/shared/ids.js';
import { createRelease } from '../../src/domain/game/release.js';
import { createReleaseDate } from '../../src/domain/shared/release-date.js';
import { NotFoundError } from '../../src/shared/errors/errors.js';

function createTestGame(overrides: Partial<Game> = {}): Game {
  const id = overrides.id ?? createGameId('test-game-1');
  return {
    id,
    titles: overrides.titles ?? [createGameTitle('Test Game', 'primary')],
    releases: overrides.releases ?? [],
    developers: overrides.developers ?? [createOrganization('Test Developer')],
    publishers: overrides.publishers ?? [createOrganization('Test Publisher')],
    genres: overrides.genres ?? [createGenre('Action')],
    externalIdentifiers: overrides.externalIdentifiers ?? [],
    relationships: overrides.relationships ?? [],
    evidence: overrides.evidence ?? [],
    classification: overrides.classification ?? 'GAME',
    completeness: overrides.completeness ?? 'FOUND_COMPLETE',
  };
}

describe('Games API', () => {
  let mockGames: Game[];
  let mockCatalogService: CatalogService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockGames = [
      createTestGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('The Legend of Zelda: Breath of the Wild', 'primary')],
        developers: [createOrganization('Nintendo EPD')],
        publishers: [createOrganization('Nintendo')],
        genres: [createGenre('Action'), createGenre('Adventure')],
        classification: 'GAME',
        completeness: 'FOUND_COMPLETE',
        releases: [
          createRelease({
            id: createReleaseId('release-1'),
            gameId: createGameId('game-1'),
            platform: createPlatform('Nintendo Switch', 'Nintendo', 'handheld'),
            releaseDate: createReleaseDate(2017, 3, 3),
          }),
        ],
      }),
      createTestGame({
        id: createGameId('game-2'),
        titles: [createGameTitle('Super Mario Odyssey', 'primary')],
        developers: [createOrganization('Nintendo EPD')],
        publishers: [createOrganization('Nintendo')],
        genres: [createGenre('Platformer')],
        classification: 'GAME',
        completeness: 'FOUND_COMPLETE',
        releases: [
          createRelease({
            id: createReleaseId('release-2'),
            gameId: createGameId('game-2'),
            platform: createPlatform('Nintendo Switch', 'Nintendo', 'handheld'),
            releaseDate: createReleaseDate(2017, 10, 27),
          }),
        ],
      }),
      createTestGame({
        id: createGameId('game-3'),
        titles: [createGameTitle('Resident Evil 4', 'primary')],
        developers: [createOrganization('Capcom')],
        publishers: [createOrganization('Capcom')],
        genres: [createGenre('Survival Horror')],
        classification: 'GAME',
        completeness: 'FOUND_COMPLETE',
        releases: [
          createRelease({
            id: createReleaseId('release-3'),
            gameId: createGameId('game-3'),
            platform: createPlatform('PlayStation 5', 'PlayStation', 'console'),
            releaseDate: createReleaseDate(2023, 3, 24),
          }),
        ],
      }),
    ];

    mockCatalogService = {
      listGames: async (query: GameQuery) => {
        let filtered = [...mockGames];

        if (query.search) {
          const searchLower = query.search.toLowerCase();
          filtered = filtered.filter(
            (g) =>
              g.titles.some((t) => t.value.toLowerCase().includes(searchLower)) ||
              g.developers.some((d) => d.name.toLowerCase().includes(searchLower)) ||
              g.publishers.some((p) => p.name.toLowerCase().includes(searchLower)),
          );
        }

        if (query.title) {
          const titleLower = query.title.toLowerCase();
          filtered = filtered.filter((g) =>
            g.titles.some((t) => t.value.toLowerCase().includes(titleLower)),
          );
        }

        if (query.developer) {
          const devLower = query.developer.toLowerCase();
          filtered = filtered.filter((g) =>
            g.developers.some((d) => d.name.toLowerCase().includes(devLower)),
          );
        }

        if (query.publisher) {
          const pubLower = query.publisher.toLowerCase();
          filtered = filtered.filter((g) =>
            g.publishers.some((p) => p.name.toLowerCase().includes(pubLower)),
          );
        }

        if (query.genre) {
          const genreLower = query.genre.toLowerCase();
          filtered = filtered.filter((g) =>
            g.genres.some((gn) => gn.name.toLowerCase().includes(genreLower)),
          );
        }

        if (query.classification) {
          filtered = filtered.filter((g) => g.classification === query.classification);
        }

        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const start = (page - 1) * limit;
        const paginated = filtered.slice(start, start + limit);

        return {
          data: {
            items: paginated,
            total: filtered.length,
            page,
            limit,
            totalPages: Math.ceil(filtered.length / limit),
          },
          origin: 'database' as const,
        };
      },

      searchGames: async (
        searchQuery: string,
        options?: { page?: number; limit?: number; sort?: GameQuery['sort'] },
      ) => {
        const query: GameQuery = {
          search: searchQuery,
          page: options?.page,
          limit: options?.limit,
          sort: options?.sort,
        };
        return mockCatalogService.listGames(query);
      },

      getGameById: async (id: string) => {
        const game = mockGames.find((g) => g.id === id);
        if (!game) {
          throw new NotFoundError(`Game with ID ${id} not found`);
        }
        return { data: game, origin: 'database' as const };
      },
    };

    app = createApp({
      games: { catalogService: mockCatalogService },
      cover: {
        coverService: {
          searchCovers: async () => ({
            query: '',
            gameId: null,
            selected: null,
            candidates: [],
            errors: [],
          }),
          getGameCover: async () => ({
            query: '',
            gameId: '',
            selected: null,
            candidates: [],
            errors: [],
          }),
        } as never,
      },
    });
  });

  describe('GET /api/v1/games', () => {
    it('returns paginated games list', async () => {
      const res = await request(app).get('/api/v1/games');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(20);
      expect(res.body.pagination.total).toBe(3);
    });

    it('filters by search term', async () => {
      const res = await request(app).get('/api/v1/games?search=zelda');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe('game-1');
    });

    it('filters by developer', async () => {
      const res = await request(app).get('/api/v1/games?developer=Nintendo');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('filters by publisher', async () => {
      const res = await request(app).get('/api/v1/games?publisher=Capcom');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe('game-3');
    });

    it('filters by genre', async () => {
      const res = await request(app).get('/api/v1/games?genre=Platformer');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe('game-2');
    });

    it('filters by classification', async () => {
      const res = await request(app).get('/api/v1/games?classification=GAME');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(3);
    });

    it('supports pagination', async () => {
      const res = await request(app).get('/api/v1/games?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.pagination.totalPages).toBe(2);
    });

    it('returns empty array for non-matching search', async () => {
      const res = await request(app).get('/api/v1/games?search=nonexistent');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
      expect(res.body.pagination.total).toBe(0);
    });
  });

  describe('GET /api/v1/games/search', () => {
    it('searches games by query', async () => {
      const res = await request(app).get('/api/v1/games/search?q=zelda');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe('game-1');
    });

    it('returns 400 for missing query', async () => {
      const res = await request(app).get('/api/v1/games/search');

      expect(res.status).toBe(400);
    });

    it('returns empty array for non-matching search', async () => {
      const res = await request(app).get('/api/v1/games/search?q=nonexistent');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });

  describe('GET /api/v1/games/:id', () => {
    it('returns a game by ID', async () => {
      const res = await request(app).get('/api/v1/games/game-1');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe('game-1');
      expect(res.body.data.titles[0].value).toBe('The Legend of Zelda: Breath of the Wild');
    });

    it('returns 404 for non-existent game', async () => {
      const res = await request(app).get('/api/v1/games/non-existent');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns game with correct structure', async () => {
      const res = await request(app).get('/api/v1/games/game-1');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBeDefined();
      expect(Array.isArray(res.body.data.titles)).toBe(true);
      expect(Array.isArray(res.body.data.releases)).toBe(true);
      expect(Array.isArray(res.body.data.developers)).toBe(true);
      expect(Array.isArray(res.body.data.publishers)).toBe(true);
      expect(Array.isArray(res.body.data.genres)).toBe(true);
      expect(res.body.data.classification).toBeDefined();
      expect(res.body.data.completeness).toBeDefined();
    });
  });

  describe('Game Response Structure', () => {
    it('returns game with releases', async () => {
      const res = await request(app).get('/api/v1/games/game-1');

      expect(res.status).toBe(200);
      expect(res.body.data.releases.length).toBe(1);
      expect(res.body.data.releases[0].platform.name).toBe('Nintendo Switch');
      expect(res.body.data.releases[0].platform.family).toBe('Nintendo');
      expect(res.body.data.releases[0].platform.type).toBe('handheld');
    });

    it('returns game with developers and publishers', async () => {
      const res = await request(app).get('/api/v1/games/game-1');

      expect(res.status).toBe(200);
      expect(res.body.data.developers[0].name).toBe('Nintendo EPD');
      expect(res.body.data.publishers[0].name).toBe('Nintendo');
    });

    it('returns game with genres', async () => {
      const res = await request(app).get('/api/v1/games/game-1');

      expect(res.status).toBe(200);
      expect(res.body.data.genres.length).toBe(2);
      expect(res.body.data.genres.map((g: { name: string }) => g.name)).toContain('Action');
      expect(res.body.data.genres.map((g: { name: string }) => g.name)).toContain('Adventure');
    });
  });

  describe('Platform Ontology', () => {
    it('distinguishes platform from distribution channel', async () => {
      const res = await request(app).get('/api/v1/games/game-1');

      expect(res.status).toBe(200);
      expect(res.body.data.releases[0].platform.name).toBe('Nintendo Switch');
      expect(res.body.data.releases[0].platform.family).toBe('Nintendo');
      expect(res.body.data.releases[0].platform.type).toBe('handheld');
    });

    it('returns correct platform type for console', async () => {
      const res = await request(app).get('/api/v1/games/game-3');

      expect(res.status).toBe(200);
      expect(res.body.data.releases[0].platform.name).toBe('PlayStation 5');
      expect(res.body.data.releases[0].platform.family).toBe('PlayStation');
      expect(res.body.data.releases[0].platform.type).toBe('console');
    });
  });
});
