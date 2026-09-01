import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/interfaces/http/app.js';
import type { CatalogService } from '../../src/application/catalog-service.js';
import type { PlatformCatalogService } from '../../src/application/platform-catalog-service.js';
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
import type { PlatformCatalogEntryWithGameCount } from '../../src/domain/platform/platform-catalog-repository.js';
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

function createTestPlatform(
  overrides: Partial<PlatformCatalogEntryWithGameCount> = {},
): PlatformCatalogEntryWithGameCount {
  return {
    id: overrides.id ?? 'test-platform',
    name: overrides.name ?? 'Test Platform',
    company: overrides.company ?? 'Test Company',
    releaseYear: overrides.releaseYear ?? 2000,
    status: overrides.status ?? 'active',
    family: overrides.family ?? null,
    type: overrides.type ?? 'console',
    thumb: overrides.thumb ?? null,
    gameCount: overrides.gameCount ?? 0,
  };
}

describe('Phase 17 — Platform Catalog & Advanced Game Queries', () => {
  let mockGames: Game[];
  let mockCatalogService: CatalogService;
  let mockPlatformCatalogService: PlatformCatalogService;
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
      createTestGame({
        id: createGameId('game-4'),
        titles: [createGameTitle('Final Fantasy VII', 'primary')],
        developers: [createOrganization('Square Enix')],
        publishers: [createOrganization('Square Enix')],
        genres: [createGenre('RPG')],
        classification: 'GAME',
        completeness: 'FOUND_COMPLETE',
        releases: [
          createRelease({
            id: createReleaseId('release-4'),
            gameId: createGameId('game-4'),
            platform: createPlatform('PlayStation', 'PlayStation', 'console'),
            releaseDate: createReleaseDate(1997, 1, 31),
          }),
        ],
      }),
      createTestGame({
        id: createGameId('game-5'),
        titles: [createGameTitle('Chrono Trigger', 'primary')],
        developers: [createOrganization('Square Enix')],
        publishers: [createOrganization('Square Enix')],
        genres: [createGenre('RPG')],
        classification: 'GAME',
        completeness: 'FOUND_COMPLETE',
        releases: [
          createRelease({
            id: createReleaseId('release-5'),
            gameId: createGameId('game-5'),
            platform: createPlatform('Super Nintendo', 'Nintendo', 'console'),
            releaseDate: createReleaseDate(1995, 3, 11),
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

        if (query.platforms && query.platforms.length > 0) {
          const platformsLower = query.platforms.map((p) => p.toLowerCase());
          filtered = filtered.filter((g) =>
            g.releases.some((r) =>
              platformsLower.some((p) => r.platform.name.toLowerCase().includes(p)),
            ),
          );
        } else if (query.platform) {
          const platformLower = query.platform.toLowerCase();
          filtered = filtered.filter((g) =>
            g.releases.some((r) => r.platform.name.toLowerCase().includes(platformLower)),
          );
        }

        if (query.developers && query.developers.length > 0) {
          const devsLower = query.developers.map((d) => d.toLowerCase());
          filtered = filtered.filter((g) =>
            g.developers.some((d) => devsLower.some((dev) => d.name.toLowerCase().includes(dev))),
          );
        } else if (query.developer) {
          const devLower = query.developer.toLowerCase();
          filtered = filtered.filter((g) =>
            g.developers.some((d) => d.name.toLowerCase().includes(devLower)),
          );
        }

        if (query.publishers && query.publishers.length > 0) {
          const pubsLower = query.publishers.map((p) => p.toLowerCase());
          filtered = filtered.filter((g) =>
            g.publishers.some((p) => pubsLower.some((pub) => p.name.toLowerCase().includes(pub))),
          );
        } else if (query.publisher) {
          const pubLower = query.publisher.toLowerCase();
          filtered = filtered.filter((g) =>
            g.publishers.some((p) => p.name.toLowerCase().includes(pubLower)),
          );
        }

        if (query.genres && query.genres.length > 0) {
          const genresLower = query.genres.map((g) => g.toLowerCase());
          filtered = filtered.filter((g) =>
            g.genres.some((gn) =>
              genresLower.some((genre) => gn.name.toLowerCase().includes(genre)),
            ),
          );
        } else if (query.genre) {
          const genreLower = query.genre.toLowerCase();
          filtered = filtered.filter((g) =>
            g.genres.some((gn) => gn.name.toLowerCase().includes(genreLower)),
          );
        }

        if (query.classification) {
          filtered = filtered.filter((g) => g.classification === query.classification);
        }

        if (query.releaseYear) {
          filtered = filtered.filter((g) =>
            g.releases.some((r) => r.releaseDate?.year === query.releaseYear),
          );
        }

        if (query.releaseYearFrom !== undefined || query.releaseYearTo !== undefined) {
          filtered = filtered.filter((g) =>
            g.releases.some((r) => {
              if (!r.releaseDate) return false;
              const year = r.releaseDate.year;
              if (query.releaseYearFrom !== undefined && year < query.releaseYearFrom) return false;
              if (query.releaseYearTo !== undefined && year > query.releaseYearTo) return false;
              return true;
            }),
          );
        }

        const sortField = query.sort?.field ?? 'title';
        const order = query.sort?.direction === 'desc' ? -1 : 1;
        filtered.sort((a, b) => {
          if (sortField === 'title' || sortField === 'name') {
            return order * a.titles[0].value.localeCompare(b.titles[0].value);
          }
          if (sortField === 'createdAt') {
            return order * a.id.localeCompare(b.id);
          }
          if (sortField === 'releaseDate') {
            const aDate = a.releases[0]?.releaseDate;
            const bDate = b.releases[0]?.releaseDate;
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            return (
              order *
              (aDate.year * 10000 +
                aDate.month * 100 +
                aDate.day -
                (bDate.year * 10000 + bDate.month * 100 + bDate.day))
            );
          }
          if (sortField === 'completeness') {
            return order * a.completeness.localeCompare(b.completeness);
          }
          return 0;
        });

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
          throw new Error(`Game with ID ${id} not found`);
        }
        return { data: game, origin: 'database' as const };
      },
    };

    const mockPlatforms: PlatformCatalogEntryWithGameCount[] = [
      createTestPlatform({
        id: 'nintendo-switch',
        name: 'Nintendo Switch',
        company: 'Nintendo',
        releaseYear: 2017,
        status: 'active',
        family: 'Nintendo',
        type: 'handheld',
        gameCount: 2,
      }),
      createTestPlatform({
        id: 'playstation-5',
        name: 'PlayStation 5',
        company: 'Sony',
        releaseYear: 2020,
        status: 'active',
        family: 'PlayStation',
        type: 'console',
        gameCount: 1,
      }),
      createTestPlatform({
        id: 'playstation',
        name: 'PlayStation',
        company: 'Sony',
        releaseYear: 1994,
        status: 'inactive',
        family: 'PlayStation',
        type: 'console',
        gameCount: 1,
      }),
      createTestPlatform({
        id: 'super-nintendo',
        name: 'Super Nintendo',
        company: 'Nintendo',
        releaseYear: 1990,
        status: 'inactive',
        family: 'Nintendo',
        type: 'console',
        gameCount: 1,
      }),
      createTestPlatform({
        id: 'nintendo-64',
        name: 'Nintendo 64',
        company: 'Nintendo',
        releaseYear: 1996,
        status: 'inactive',
        family: 'Nintendo',
        type: 'console',
        gameCount: 0,
      }),
    ];

    mockPlatformCatalogService = {
      listPlatforms: async (query) => {
        let filtered = [...mockPlatforms];

        if (query.companyName) {
          const companyLower = query.companyName.toLowerCase();
          filtered = filtered.filter((p) => p.company.toLowerCase().includes(companyLower));
        }

        if (query.status) {
          filtered = filtered.filter((p) => p.status === query.status);
        }

        if (query.releaseYear !== undefined) {
          filtered = filtered.filter((p) => p.releaseYear === query.releaseYear);
        }

        if (query.releaseYearRange) {
          filtered = filtered.filter((p) => {
            if (p.releaseYear === null) return false;
            return (
              p.releaseYear >= query.releaseYearRange!.from &&
              p.releaseYear <= query.releaseYearRange!.to
            );
          });
        }

        if (query.showEmpty === false) {
          filtered = filtered.filter((p) => p.gameCount > 0);
        }

        if (query.sort) {
          const dir = query.sort.direction === 'desc' ? -1 : 1;
          filtered.sort((a, b) => {
            if (query.sort!.field === 'name') {
              return dir * a.name.localeCompare(b.name);
            }
            if (query.sort!.field === 'releaseYear') {
              return dir * ((a.releaseYear ?? 0) - (b.releaseYear ?? 0));
            }
            if (query.sort!.field === 'gameCount') {
              return dir * (a.gameCount - b.gameCount);
            }
            return 0;
          });
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

      getPlatformById: async (id: string) => {
        const platform = mockPlatforms.find((p) => p.id === id);
        if (!platform) {
          throw new NotFoundError(`Platform with ID ${id} not found`);
        }
        return { data: platform, origin: 'database' as const };
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
      platforms: { platformCatalogService: mockPlatformCatalogService },
    });
  });

  describe('Platform Catalog', () => {
    describe('GET /api/v1/platforms/summary', () => {
      it('returns paginated platforms', async () => {
        const res = await request(app).get('/api/v1/platforms/summary');

        expect(res.status).toBe(200);
        expect(res.body.data).toBeDefined();
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.pagination).toBeDefined();
        expect(res.body.pagination.total).toBe(4);
      });

      it('filters by company', async () => {
        const res = await request(app).get('/api/v1/platforms/summary?companyName=nintendo');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
        res.body.data.forEach((p: { company: string }) => {
          expect(p.company.toLowerCase()).toContain('nintendo');
        });
      });

      it('filters by status', async () => {
        const res = await request(app).get('/api/v1/platforms/summary?platformStatus=inactive');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
        res.body.data.forEach((p: { status: string }) => {
          expect(p.status).toBe('inactive');
        });
      });

      it('filters by exact release year', async () => {
        const res = await request(app).get('/api/v1/platforms/summary?releaseYear=2017');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].name).toBe('Nintendo Switch');
      });

      it('filters by release year range', async () => {
        const res = await request(app).get('/api/v1/platforms/summary?releaseYearRange=1990-2000');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
        res.body.data.forEach((p: { releaseYear: number }) => {
          expect(p.releaseYear).toBeGreaterThanOrEqual(1990);
          expect(p.releaseYear).toBeLessThanOrEqual(2000);
        });
      });

      it('combines filters', async () => {
        const res = await request(app).get(
          '/api/v1/platforms/summary?companyName=nintendo&platformStatus=inactive',
        );

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        res.body.data.forEach((p: { company: string; status: string }) => {
          expect(p.company.toLowerCase()).toContain('nintendo');
          expect(p.status).toBe('inactive');
        });
      });

      it('hides empty platforms by default', async () => {
        const res = await request(app).get('/api/v1/platforms/summary');

        expect(res.status).toBe(200);
        res.body.data.forEach((p: { gameCount: number }) => {
          expect(p.gameCount).toBeGreaterThan(0);
        });
      });

      it('shows empty platforms when requested', async () => {
        const res = await request(app).get('/api/v1/platforms/summary?showEmptyPlatforms=true');

        expect(res.status).toBe(200);
        const nintendo64 = res.body.data.find((p: { id: string }) => p.id === 'nintendo-64');
        expect(nintendo64).toBeDefined();
        expect(nintendo64.gameCount).toBe(0);
      });

      it('includes gameCount', async () => {
        const res = await request(app).get('/api/v1/platforms/summary');

        expect(res.status).toBe(200);
        res.body.data.forEach((p: { gameCount: number }) => {
          expect(typeof p.gameCount).toBe('number');
          expect(p.gameCount).toBeGreaterThanOrEqual(0);
        });
      });

      it('sorts by name ascending', async () => {
        const res = await request(app).get('/api/v1/platforms/summary?sort=name&order=asc');

        expect(res.status).toBe(200);
        const names = res.body.data.map((p: { name: string }) => p.name);
        const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
        expect(names).toEqual(sorted);
      });

      it('sorts by releaseYear descending', async () => {
        const res = await request(app).get('/api/v1/platforms/summary?sort=releaseYear&order=desc');

        expect(res.status).toBe(200);
        const years = res.body.data.map((p: { releaseYear: number }) => p.releaseYear);
        const sorted = [...years].sort((a: number, b: number) => b - a);
        expect(years).toEqual(sorted);
      });
    });

    describe('GET /api/v1/platforms/:platformId', () => {
      it('returns platform by ID', async () => {
        const res = await request(app).get('/api/v1/platforms/nintendo-switch');

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe('nintendo-switch');
        expect(res.body.data.name).toBe('Nintendo Switch');
        expect(res.body.data.company).toBe('Nintendo');
        expect(res.body.data.gameCount).toBe(2);
      });

      it('returns 404 for non-existent platform', async () => {
        const res = await request(app).get('/api/v1/platforms/non-existent');

        expect(res.status).toBe(404);
      });
    });
  });

  describe('Advanced Game Filtering', () => {
    describe('Multiple platforms', () => {
      it('filters by multiple platforms (OR)', async () => {
        const res = await request(app).get(
          '/api/v1/games?platform=Nintendo%20Switch,PlayStation%205',
        );

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(3);
      });
    });

    describe('Multiple genres', () => {
      it('filters by multiple genres (OR)', async () => {
        const res = await request(app).get('/api/v1/games?genre=RPG,Survival%20Horror');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(3);
      });
    });

    describe('Developer filter', () => {
      it('filters by developer', async () => {
        const res = await request(app).get('/api/v1/games?developer=Nintendo');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
      });

      it('filters by multiple developers (OR)', async () => {
        const res = await request(app).get('/api/v1/games?developer=Nintendo,Capcom');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(3);
      });
    });

    describe('Publisher filter', () => {
      it('filters by publisher', async () => {
        const res = await request(app).get('/api/v1/games?publisher=Square%20Enix');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
      });
    });

    describe('Release year range', () => {
      it('filters by releaseYearFrom and releaseYearTo', async () => {
        const res = await request(app).get('/api/v1/games?releaseYearFrom=1995&releaseYearTo=2000');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
      });

      it('filters by releaseYearFrom only', async () => {
        const res = await request(app).get('/api/v1/games?releaseYearFrom=2017');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(3);
      });

      it('filters by releaseYearTo only', async () => {
        const res = await request(app).get('/api/v1/games?releaseYearTo=1997');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
      });
    });

    describe('Combined filters', () => {
      it('combines platform, genre, and developer', async () => {
        const res = await request(app).get(
          '/api/v1/games?platform=PlayStation&genre=RPG&developer=Square%20Enix',
        );

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].titles[0].value).toBe('Final Fantasy VII');
      });

      it('combines platform and release range', async () => {
        const res = await request(app).get(
          '/api/v1/games?platform=PlayStation&releaseYearFrom=1994&releaseYearTo=2000',
        );

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].titles[0].value).toBe('Final Fantasy VII');
      });
    });

    describe('Sorting', () => {
      it('sorts by title ascending', async () => {
        const res = await request(app).get('/api/v1/games?sort=title&order=asc');

        expect(res.status).toBe(200);
        const titles = res.body.data.map(
          (g: { titles: Array<{ value: string }> }) => g.titles[0].value,
        );
        const sorted = [...titles].sort((a: string, b: string) => a.localeCompare(b));
        expect(titles).toEqual(sorted);
      });

      it('sorts by releaseDate ascending', async () => {
        const res = await request(app).get('/api/v1/games?sort=releaseDate&order=asc');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(5);
      });
    });

    describe('Pagination', () => {
      it('paginates results', async () => {
        const res = await request(app).get('/api/v1/games?page=1&limit=2');

        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(2);
        expect(res.body.pagination.total).toBe(5);
        expect(res.body.pagination.totalPages).toBe(3);
      });
    });
  });
});
