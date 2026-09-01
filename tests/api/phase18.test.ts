import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import { createPlatformCatalogEntry } from '../../src/domain/platform/platform-catalog.js';
import type { PlatformCatalogEntryWithGameCount } from '../../src/domain/platform/platform-catalog-repository.js';
import { NotFoundError } from '../../src/shared/errors/errors.js';
import { PLATFORM_SEED_DATA } from '../../src/platform-catalog/platforms-seed-data.js';

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

describe('Phase 18 — Platform Seed & Catalog Completeness', () => {
  describe('Seed Data', () => {
    it('exports a non-empty seed dataset', () => {
      expect(PLATFORM_SEED_DATA).toBeDefined();
      expect(Array.isArray(PLATFORM_SEED_DATA)).toBe(true);
      expect(PLATFORM_SEED_DATA.length).toBeGreaterThan(100);
    });

    it('each seed entry has required fields', () => {
      for (const entry of PLATFORM_SEED_DATA) {
        expect(entry.id).toBeTruthy();
        expect(entry.name).toBeTruthy();
        expect(entry.company).toBeTruthy();
        expect(['active', 'inactive', 'discontinued']).toContain(entry.status);
      }
    });

    it('each seed entry has a unique id', () => {
      const ids = PLATFORM_SEED_DATA.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('each seed entry has a unique name', () => {
      const names = PLATFORM_SEED_DATA.map((e) => e.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('all family values are valid PlatformFamily or null', () => {
      const validFamilies = [
        'PC',
        'PlayStation',
        'Xbox',
        'Nintendo',
        'Sega',
        'Atari',
        'Mobile',
        'Other',
      ];
      for (const entry of PLATFORM_SEED_DATA) {
        if (entry.family !== null) {
          expect(validFamilies).toContain(entry.family);
        }
      }
    });

    it('all type values are valid PlatformType or null', () => {
      const validTypes = [
        'console',
        'handheld',
        'arcade',
        'computer',
        'mobile',
        'web',
        'fantasy-console',
        'other',
      ];
      for (const entry of PLATFORM_SEED_DATA) {
        if (entry.type !== null) {
          expect(validTypes).toContain(entry.type);
        }
      }
    });
  });

  describe('createPlatformCatalogEntry', () => {
    it('creates entry from seed data', () => {
      const entry = createPlatformCatalogEntry(PLATFORM_SEED_DATA[0]);
      expect(entry.id).toBe(PLATFORM_SEED_DATA[0].id);
      expect(entry.name).toBe(PLATFORM_SEED_DATA[0].name);
      expect(entry.company).toBe(PLATFORM_SEED_DATA[0].company);
    });

    it('trims whitespace from fields', () => {
      const entry = createPlatformCatalogEntry({
        id: '  test-id  ',
        name: '  Test Platform  ',
        company: '  Test Company  ',
      });
      expect(entry.id).toBe('test-id');
      expect(entry.name).toBe('Test Platform');
      expect(entry.company).toBe('Test Company');
    });

    it('throws for empty id', () => {
      expect(() => createPlatformCatalogEntry({ id: '', name: 'Test', company: 'Test' })).toThrow();
    });

    it('throws for empty name', () => {
      expect(() => createPlatformCatalogEntry({ id: 'test', name: '', company: 'Test' })).toThrow();
    });

    it('throws for empty company', () => {
      expect(() => createPlatformCatalogEntry({ id: 'test', name: 'Test', company: '' })).toThrow();
    });
  });

  describe('PlatformSeedService (unit)', () => {
    it('calls upsert for each seed entry', async () => {
      const mockRepository = {
        upsert: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        findByCompany: vi.fn(),
      };

      const { PlatformSeedService } =
        await import('../../src/application/platform-seed-service.js');
      const seedService = new PlatformSeedService({ platformCatalogRepository: mockRepository });

      const result = await seedService.seed();

      expect(mockRepository.upsert).toHaveBeenCalledTimes(PLATFORM_SEED_DATA.length);
      expect(result.errors).toBe(0);
    });

    it('reports errors without crashing', async () => {
      let callCount = 0;
      const mockRepository = {
        upsert: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 3) {
            throw new Error('Simulated failure');
          }
          return Promise.resolve();
        }),
        findById: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        findByCompany: vi.fn(),
      };

      const { PlatformSeedService } =
        await import('../../src/application/platform-seed-service.js');
      const seedService = new PlatformSeedService({ platformCatalogRepository: mockRepository });

      const result = await seedService.seed();

      expect(result.errors).toBe(1);
      expect(mockRepository.upsert).toHaveBeenCalledTimes(PLATFORM_SEED_DATA.length);
    });

    it('is idempotent (upsert uses $set, not insert)', async () => {
      const mockRepository = {
        upsert: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        findByCompany: vi.fn(),
      };

      const { PlatformSeedService } =
        await import('../../src/application/platform-seed-service.js');
      const seedService = new PlatformSeedService({ platformCatalogRepository: mockRepository });

      await seedService.seed();
      const firstCallCount = mockRepository.upsert.mock.calls.length;

      await seedService.seed();
      const secondCallCount = mockRepository.upsert.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount * 2);
    });
  });

  describe('Platform Catalog API (mocked)', () => {
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
        searchGames: async (q: string) => mockCatalogService.listGames({ search: q }),
        getGameById: async (id: string) => {
          const game = mockGames.find((g) => g.id === id);
          if (!game) throw new Error('not found');
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
          gameCount: 1,
        }),
        createTestPlatform({
          id: 'playstation-5',
          name: 'PlayStation 5',
          company: 'Sony',
          releaseYear: 2020,
          status: 'active',
          family: 'PlayStation',
          type: 'console',
          gameCount: 0,
        }),
        createTestPlatform({
          id: 'xbox-series-x',
          name: 'Xbox Series X',
          company: 'Microsoft',
          releaseYear: 2020,
          status: 'active',
          family: 'Xbox',
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
              if (query.sort!.field === 'name') return dir * a.name.localeCompare(b.name);
              if (query.sort!.field === 'releaseYear')
                return dir * ((a.releaseYear ?? 0) - (b.releaseYear ?? 0));
              if (query.sort!.field === 'gameCount') return dir * (a.gameCount - b.gameCount);
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
          if (!platform) throw new NotFoundError(`Platform ${id} not found`);
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

    describe('GET /api/v1/platforms/summary', () => {
      it('returns platforms', async () => {
        const res = await request(app).get('/api/v1/platforms/summary');

        expect(res.status).toBe(200);
        expect(res.body.data).toBeDefined();
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
      });

      it('filters by company name', async () => {
        const res = await request(app).get('/api/v1/platforms/summary?companyName=nintendo');

        expect(res.status).toBe(200);
        res.body.data.forEach((p: { company: string }) => {
          expect(p.company.toLowerCase()).toContain('nintendo');
        });
      });

      it('filters by status', async () => {
        const res = await request(app).get('/api/v1/platforms/summary?platformStatus=active');

        expect(res.status).toBe(200);
        res.body.data.forEach((p: { status: string }) => {
          expect(p.status).toBe('active');
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
        expect(res.body.data.length).toBe(3);
      });
    });

    describe('GET /api/v1/platforms/:platformId', () => {
      it('returns platform by ID', async () => {
        const res = await request(app).get('/api/v1/platforms/nintendo-switch');

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe('nintendo-switch');
        expect(res.body.data.name).toBe('Nintendo Switch');
      });

      it('returns 404 for non-existent platform', async () => {
        const res = await request(app).get('/api/v1/platforms/non-existent');

        expect(res.status).toBe(404);
      });
    });
  });
});
