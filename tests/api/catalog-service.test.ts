import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CatalogService } from '../../src/application/catalog-service.js';
import type {
  GameRepository,
  GameQuery,
  PaginatedResult,
} from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { NotFoundError, PersistenceError } from '../../src/shared/errors/errors.js';
import type { DiscoveryEngine } from '../../src/discovery/discovery-engine.js';
import type { DiscoveryResult } from '../../src/discovery/discovery-types.js';
import { EnrichmentService } from '../../src/application/enrichment-service.js';

function createTestGame(id: string, title: string): Game {
  return {
    id: createGameId(id),
    titles: [createGameTitle(title, 'primary')],
    releases: [],
    developers: [createOrganization('Test Developer')],
    publishers: [createOrganization('Test Publisher')],
    genres: [createGenre('Action')],
    externalIdentifiers: [],
    relationships: [],
    evidence: [],
    classification: 'GAME',
    completeness: 'FOUND_COMPLETE',
  };
}

function createMockRepository(games: Game[]): {
  repository: GameRepository;
  savedGames: Game[];
  updatedGames: Game[];
} {
  const savedGames: Game[] = [];
  const updatedGames: Game[] = [];
  const allGames = [...games];

  const repository: GameRepository = {
    findById: async (id) => allGames.find((g) => g.id === id) ?? null,
    findByExternalIdentifier: async (input) =>
      allGames.find((g) =>
        g.externalIdentifiers.some((e) => e.source === input.source && e.id === input.externalId),
      ) ?? null,
    existsByExternalIdentifier: async (input) =>
      allGames.some((g) =>
        g.externalIdentifiers.some((e) => e.source === input.source && e.id === input.externalId),
      ),
    existsById: async (id) => allGames.some((g) => g.id === id),
    findMany: async (query: GameQuery): Promise<PaginatedResult<Game>> => {
      let filtered = [...allGames];

      if (query.search) {
        const searchLower = query.search.toLowerCase();
        filtered = filtered.filter((g) =>
          g.titles.some((t) => t.value.toLowerCase().includes(searchLower)),
        );
      }

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      return {
        items: paginated,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      };
    },
    save: async (game) => {
      savedGames.push(game);
      allGames.push(game);
    },
    update: async (game) => {
      updatedGames.push(game);
      const idx = allGames.findIndex((g) => g.id === game.id);
      if (idx >= 0) allGames[idx] = game;
    },
    deleteById: async () => {},
  };

  return { repository, savedGames, updatedGames };
}

function createFailingRepository(): GameRepository {
  return {
    findById: async () => {
      throw new PersistenceError('MongoDB connection refused');
    },
    findByExternalIdentifier: async () => {
      throw new PersistenceError('MongoDB connection refused');
    },
    existsByExternalIdentifier: async () => {
      throw new PersistenceError('MongoDB connection refused');
    },
    existsById: async () => {
      throw new PersistenceError('MongoDB connection refused');
    },
    findMany: async () => {
      throw new PersistenceError('MongoDB connection refused');
    },
    save: async () => {
      throw new PersistenceError('MongoDB connection refused');
    },
    update: async () => {
      throw new PersistenceError('MongoDB connection refused');
    },
    deleteById: async () => {
      throw new PersistenceError('MongoDB connection refused');
    },
  };
}

function createMockDiscoveryEngine(overrideResult?: Partial<DiscoveryResult>): DiscoveryEngine {
  return {
    discover: vi.fn().mockResolvedValue({
      query: '',
      groups: [
        {
          groupId: 'discovery-1',
          observations: [
            {
              source: 'wikipedia',
              sourceId: 'wp-123',
              candidate: {
                titles: [{ value: 'Doom', type: 'primary' as const }],
                developers: [{ name: 'id Software' }],
                publishers: [{ name: 'Bethesda' }],
                genres: [{ name: 'Shooter' }],
                releases: [],
                externalIdentifiers: [{ source: 'wikipedia', id: 'wp-123' }],
                provenance: {
                  source: 'wikipedia',
                  sourceId: 'wp-123',
                  retrievedAt: new Date().toISOString(),
                  rawTitle: 'Doom',
                },
                classificationHints: [],
                description: null,
                coverUrls: [],
              },
              classification: {
                category: 'GAME',
                confidence: 0.9,
                signals: [],
                reason: 'Looks like a game',
              },
              retrievedAt: new Date().toISOString(),
            },
          ],
          mergedClassification: {
            category: 'GAME',
            confidence: 0.9,
            signals: [],
            reason: 'Looks like a game',
          },
          identityResolution: {
            outcome: 'NEW_ENTITY',
            relationship: null,
            confidence: 0.9,
            signals: [],
            reason: 'New entity',
            method: 'NATIVE',
          },
          rankingScore: 0.85,
          rankingBreakdown: {
            identityConfidence: 0.9,
            classificationConfidence: 0.9,
            sourceCount: 1,
            metadataCompleteness: 0.7,
            titleRelevance: 0.8,
          },
        },
      ],
      totalGroups: 1,
      sourceErrors: [],
      hasMore: false,
      ...overrideResult,
    }),
  } as unknown as DiscoveryEngine;
}

describe('CatalogService', () => {
  let games: Game[];
  let mockRepo: ReturnType<typeof createMockRepository>;
  let service: CatalogService;

  beforeEach(() => {
    games = [
      createTestGame('game-1', 'The Legend of Zelda'),
      createTestGame('game-2', 'Super Mario Bros'),
      createTestGame('game-3', 'Resident Evil'),
    ];
    mockRepo = createMockRepository(games);
    service = new CatalogService({ gameRepository: mockRepo.repository });
  });

  describe('listGames', () => {
    it('returns paginated results with database origin', async () => {
      const result = await service.listGames({});

      expect(result.origin).toBe('database');
      expect(result.data.items.length).toBe(3);
      expect(result.data.total).toBe(3);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.totalPages).toBe(1);
    });

    it('filters by search term', async () => {
      const result = await service.listGames({ search: 'zelda' });

      expect(result.origin).toBe('database');
      expect(result.data.items.length).toBe(1);
      expect(result.data.items[0].id).toBe('game-1');
    });

    it('supports pagination', async () => {
      const result = await service.listGames({ page: 1, limit: 2 });

      expect(result.origin).toBe('database');
      expect(result.data.items.length).toBe(2);
      expect(result.data.totalPages).toBe(2);
    });

    it('propagates database failure', async () => {
      const failingService = new CatalogService({
        gameRepository: createFailingRepository(),
      });

      await expect(failingService.listGames({})).rejects.toThrow(PersistenceError);
    });
  });

  describe('searchGames', () => {
    it('returns database results with database origin when matches exist', async () => {
      const result = await service.searchGames('mario');

      expect(result.origin).toBe('database');
      expect(result.data.items.length).toBe(1);
      expect(result.data.items[0].id).toBe('game-2');
    });

    it('returns empty with scraper origin for non-matching search (no discovery engine)', async () => {
      const result = await service.searchGames('nonexistent');

      expect(result.origin).toBe('scraper');
      expect(result.data.items.length).toBe(0);
    });

    it('falls back to discovery and persists new game', async () => {
      const discoveryEngine = createMockDiscoveryEngine();
      const repo = createMockRepository([]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });
      const emptyService = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      const result = await emptyService.searchGames('Doom');

      expect(result.origin).toBe('database');
      expect(result.data.items.length).toBe(1);
      expect(result.data.items[0].titles[0].value).toBe('Doom');
      expect(repo.savedGames.length).toBe(1);
      expect(repo.savedGames[0].titles[0].value).toBe('Doom');
    });

    it('falls back to discovery when database fails', async () => {
      const discoveryEngine = createMockDiscoveryEngine();
      const failingService = new CatalogService({
        gameRepository: createFailingRepository(),
        discoveryEngine,
      });

      const result = await failingService.searchGames('Doom');

      expect(result.origin).toBe('scraper');
      expect(result.data.items.length).toBe(0);
    });

    it('returns empty scraper result when both database and discovery fail', async () => {
      const failingDiscovery = {
        discover: vi.fn().mockRejectedValue(new Error('All sources down')),
      } as unknown as DiscoveryEngine;

      const failingService = new CatalogService({
        gameRepository: createFailingRepository(),
        discoveryEngine: failingDiscovery,
      });

      const result = await failingService.searchGames('Doom');

      expect(result.origin).toBe('scraper');
      expect(result.data.items.length).toBe(0);
    });

    it('returns empty scraper result when no discovery engine available', async () => {
      const emptyService = new CatalogService({
        gameRepository: createMockRepository([]).repository,
      });

      const result = await emptyService.searchGames('Doom');

      expect(result.origin).toBe('scraper');
      expect(result.data.items.length).toBe(0);
    });

    it('does not trigger discovery when database has results', async () => {
      const discoveryEngine = createMockDiscoveryEngine();
      const serviceWithDiscovery = new CatalogService({
        gameRepository: createMockRepository(games).repository,
        discoveryEngine,
      });

      const result = await serviceWithDiscovery.searchGames('mario');

      expect(result.origin).toBe('database');
      expect(discoveryEngine.discover).not.toHaveBeenCalled();
    });

    it('discovery results are persisted and returned with database origin', async () => {
      const discoveryEngine = createMockDiscoveryEngine();
      const repo = createMockRepository([]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });
      const emptyService = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      const result = await emptyService.searchGames('Doom');

      expect(result.origin).toBe('database');
      expect(repo.savedGames.length).toBe(1);
    });

    it('passes pagination to discovery engine', async () => {
      const discoveryEngine = createMockDiscoveryEngine();
      const repo = createMockRepository([]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });
      const emptyService = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      await emptyService.searchGames('Doom', { page: 2, limit: 5 });

      expect(discoveryEngine.discover).toHaveBeenCalledWith({
        query: 'Doom',
        limit: 5,
        offset: 5,
      });
    });
  });

  describe('getGameById', () => {
    it('returns game by ID with database origin', async () => {
      const result = await service.getGameById('game-1');

      expect(result.origin).toBe('database');
      expect(result.data.id).toBe('game-1');
      expect(result.data.titles[0].value).toBe('The Legend of Zelda');
    });

    it('throws NotFoundError for non-existent game', async () => {
      await expect(service.getGameById('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('propagates database failure', async () => {
      const failingService = new CatalogService({
        gameRepository: createFailingRepository(),
      });

      await expect(failingService.getGameById('game-1')).rejects.toThrow(PersistenceError);
    });
  });
});
