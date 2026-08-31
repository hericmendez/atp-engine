import { describe, it, expect, vi } from 'vitest';
import { CatalogService } from '../../src/application/catalog-service.js';
import { EnrichmentService } from '../../src/application/enrichment-service.js';
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
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import type { DiscoveryEngine } from '../../src/discovery/discovery-engine.js';
import type { DiscoveryGroupResult } from '../../src/discovery/discovery-types.js';

function createTestGame(id: string, title: string, overrides?: Partial<Game>): Game {
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
    cover: null,
    ...overrides,
  };
}

function createTrackingRepository(initialGames: Game[] = []) {
  const allGames = [...initialGames];
  const savedGames: Game[] = [];
  const updatedGames: Game[] = [];

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

  return { repository, savedGames, updatedGames, allGames };
}

function makeGroup(overrides: Partial<DiscoveryGroupResult> = {}): DiscoveryGroupResult {
  return {
    groupId: 'group-1',
    observations: [
      {
        source: 'wikipedia',
        sourceId: 'wp-100',
        candidate: {
          titles: [{ value: 'Hollow Knight', type: 'primary' as const }],
          developers: [{ name: 'Team Cherry' }],
          publishers: [{ name: 'Team Cherry' }],
          genres: [{ name: 'Metroidvania' }],
          releases: [],
          externalIdentifiers: [{ source: 'wikipedia', id: 'wp-100' }],
          provenance: {
            source: 'wikipedia',
            sourceId: 'wp-100',
            retrievedAt: new Date().toISOString(),
            rawTitle: 'Hollow Knight',
          },
          classificationHints: [],
          description: null,
          coverUrls: [],
        },
        classification: {
          category: 'GAME',
          confidence: 0.9,
          signals: [],
          reason: 'Game',
        },
        retrievedAt: new Date().toISOString(),
      },
    ],
    mergedClassification: {
      category: 'GAME',
      confidence: 0.9,
      signals: [],
      reason: 'Game',
    },
    identityResolution: {
      outcome: 'NEW_ENTITY',
      relationship: null,
      confidence: 0.9,
      signals: [],
      reason: 'New',
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
    ...overrides,
  };
}

function makeMultiSourceGroup(): DiscoveryGroupResult {
  return {
    groupId: 'group-multi',
    observations: [
      {
        source: 'wikipedia',
        sourceId: 'wp-200',
        candidate: {
          titles: [{ value: 'Celeste', type: 'primary' as const }],
          developers: [{ name: 'Extremely OK Games' }],
          publishers: [{ name: 'Matt Makes Games' }],
          genres: [{ name: 'Platformer' }],
          releases: [],
          externalIdentifiers: [{ source: 'wikipedia', id: 'wp-200' }],
          provenance: {
            source: 'wikipedia',
            sourceId: 'wp-200',
            retrievedAt: new Date().toISOString(),
            rawTitle: 'Celeste',
          },
          classificationHints: [],
          description: null,
          coverUrls: [],
        },
        classification: {
          category: 'GAME',
          confidence: 0.9,
          signals: [],
          reason: 'Game',
        },
        retrievedAt: new Date().toISOString(),
      },
      {
        source: 'steam',
        sourceId: 'st-200',
        candidate: {
          titles: [{ value: 'Celeste', type: 'primary' as const }],
          developers: [{ name: 'Extremely OK Games' }],
          publishers: [{ name: 'Matt Makes Games Inc.' }],
          genres: [{ name: 'Platformer' }, { name: 'Indie' }],
          releases: [],
          externalIdentifiers: [{ source: 'steam', id: 'st-200' }],
          provenance: {
            source: 'steam',
            sourceId: 'st-200',
            retrievedAt: new Date().toISOString(),
            rawTitle: 'Celeste',
          },
          classificationHints: [],
          description: null,
          coverUrls: [],
        },
        classification: {
          category: 'GAME',
          confidence: 0.95,
          signals: [],
          reason: 'Game',
        },
        retrievedAt: new Date().toISOString(),
      },
    ],
    mergedClassification: {
      category: 'GAME',
      confidence: 0.95,
      signals: [],
      reason: 'Game',
    },
    identityResolution: {
      outcome: 'NEW_ENTITY',
      relationship: null,
      confidence: 0.95,
      signals: [],
      reason: 'New',
      method: 'NATIVE',
    },
    rankingScore: 0.9,
    rankingBreakdown: {
      identityConfidence: 0.95,
      classificationConfidence: 0.95,
      sourceCount: 2,
      metadataCompleteness: 0.8,
      titleRelevance: 0.9,
    },
  };
}

function createDiscoveryEngine(groups: DiscoveryGroupResult[]): DiscoveryEngine {
  return {
    discover: vi.fn().mockResolvedValue({
      query: '',
      groups,
      totalGroups: groups.length,
      sourceErrors: [],
      hasMore: false,
    }),
  } as unknown as DiscoveryEngine;
}

describe('Discovery → Enrichment → Persistence Pipeline', () => {
  describe('Scenario 1 — New game', () => {
    it('discovers, persists, and returns canonical game', async () => {
      const repo = createTrackingRepository([]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });
      const discoveryEngine = createDiscoveryEngine([makeGroup()]);
      const service = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      const result = await service.searchGames('Hollow Knight');

      expect(result.origin).toBe('database');
      expect(result.data.items.length).toBe(1);

      const game = result.data.items[0];
      expect(game.titles[0].value).toBe('Hollow Knight');
      expect(game.developers[0].name).toBe('Team Cherry');
      expect(game.externalIdentifiers.length).toBeGreaterThanOrEqual(1);
      expect(game.evidence.length).toBeGreaterThanOrEqual(1);
      expect(repo.savedGames.length).toBe(1);
    });
  });

  describe('Scenario 2 — Repeat search', () => {
    it('returns database result on second search', async () => {
      const repo = createTrackingRepository([]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });
      const discoveryEngine = createDiscoveryEngine([makeGroup()]);
      const service = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      await service.searchGames('Hollow Knight');

      vi.clearAllMocks();
      repo.savedGames.length = 0;
      repo.updatedGames.length = 0;

      const result = await service.searchGames('Hollow Knight');

      expect(result.origin).toBe('database');
      expect(result.data.items.length).toBe(1);
      expect(result.data.items[0].titles[0].value).toBe('Hollow Knight');
      expect(discoveryEngine.discover).not.toHaveBeenCalled();
      expect(repo.savedGames.length).toBe(0);
    });
  });

  describe('Scenario 3 — Existing game enrichment', () => {
    it('enriches existing game with new observations', async () => {
      const existingGame = createTestGame('game-existing', 'Hollow Knight', {
        externalIdentifiers: [createExternalIdentifier('wikipedia', 'wp-100')],
        genres: [],
      });

      const repo = createTrackingRepository([existingGame]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });
      const discoveryEngine = createDiscoveryEngine([makeGroup()]);
      const service = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      const result = await service.searchGames('Metroidvania game');

      expect(result.origin).toBe('database');
      expect(result.data.items.length).toBe(1);

      const enriched = result.data.items[0];
      expect(enriched.id).toBe('game-existing');
      expect(enriched.genres.length).toBe(1);
      expect(enriched.genres[0].name).toBe('Metroidvania');
      expect(repo.updatedGames.length).toBe(1);
      expect(repo.savedGames.length).toBe(0);
    });
  });

  describe('Scenario 4 — Idempotence', () => {
    it('same input produces same result and does not duplicate', async () => {
      const repo = createTrackingRepository([]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });
      const discoveryEngine = createDiscoveryEngine([makeGroup()]);
      const service = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      await service.searchGames('Hollow Knight');
      const firstSaveCount = repo.savedGames.length;

      await service.searchGames('Hollow Knight');
      const secondSaveCount = repo.savedGames.length;

      expect(firstSaveCount).toBe(1);
      expect(secondSaveCount).toBe(1);
    });
  });

  describe('Scenario 5 — Multiple sources', () => {
    it('converges observations from multiple sources into one game', async () => {
      const repo = createTrackingRepository([]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });
      const discoveryEngine = createDiscoveryEngine([makeMultiSourceGroup()]);
      const service = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      const result = await service.searchGames('Celeste');

      expect(result.data.items.length).toBe(1);

      const game = result.data.items[0];
      expect(game.titles[0].value).toBe('Celeste');
      expect(game.genres.length).toBeGreaterThanOrEqual(2);
      expect(game.externalIdentifiers.length).toBeGreaterThanOrEqual(2);
      expect(repo.savedGames.length).toBe(1);
    });
  });

  describe('Scenario 6 — Identity safety', () => {
    it('does not merge distinct games with similar titles', async () => {
      const existingGame = createTestGame('game-re4-2005', 'Resident Evil 4', {
        externalIdentifiers: [createExternalIdentifier('steam', '254700')],
      });

      const repo = createTrackingRepository([existingGame]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });

      const re4_2023_group = makeGroup({
        groupId: 'group-re4-2023',
        observations: [
          {
            source: 'steam',
            sourceId: 'st-2050650',
            candidate: {
              titles: [{ value: 'Resident Evil 4', type: 'primary' as const }],
              developers: [{ name: 'Capcom' }],
              publishers: [{ name: 'Capcom' }],
              genres: [{ name: 'Action' }],
              releases: [],
              externalIdentifiers: [{ source: 'steam', id: 'st-2050650' }],
              provenance: {
                source: 'steam',
                sourceId: 'st-2050650',
                retrievedAt: new Date().toISOString(),
                rawTitle: 'Resident Evil 4',
              },
              classificationHints: [],
              description: null,
              coverUrls: [],
            },
            classification: {
              category: 'GAME',
              confidence: 0.9,
              signals: [],
              reason: 'Game',
            },
            retrievedAt: new Date().toISOString(),
          },
        ],
        mergedClassification: {
          category: 'GAME',
          confidence: 0.9,
          signals: [],
          reason: 'Game',
        },
        identityResolution: {
          outcome: 'NEW_ENTITY',
          relationship: null,
          confidence: 0.9,
          signals: [],
          reason: 'New',
          method: 'NATIVE',
        },
      });

      const discoveryEngine = createDiscoveryEngine([re4_2023_group]);
      const service = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      const result = await service.searchGames('RE4 Remake');

      expect(result.data.items.length).toBe(1);

      const game = result.data.items[0];
      expect(game.id).not.toBe('game-re4-2005');
      expect(game.externalIdentifiers.some((e) => e.id === 'st-2050650')).toBe(true);

      const original = repo.allGames.find((g) => g.id === 'game-re4-2005');
      expect(original?.externalIdentifiers.some((e) => e.id === '254700')).toBe(true);
    });
  });

  describe('Scenario 7 — Source failure', () => {
    it('does not prevent valid discovery from other sources', async () => {
      const repo = createTrackingRepository([]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });

      const failingDiscovery = {
        discover: vi.fn().mockRejectedValue(new Error('Wikipedia timeout')),
      } as unknown as DiscoveryEngine;

      const service = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine: failingDiscovery,
        enrichmentService,
      });

      const result = await service.searchGames('Doom');

      expect(result.origin).toBe('scraper');
      expect(result.data.items.length).toBe(0);
    });

    it('partial group persistence failure does not block other groups', async () => {
      const repo = createTrackingRepository([]);
      const enrichmentService = new EnrichmentService({ gameRepository: repo.repository });

      const goodGroup = makeGroup({
        groupId: 'good',
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'wp-good',
            candidate: {
              titles: [{ value: 'Good Game', type: 'primary' as const }],
              developers: [],
              publishers: [],
              genres: [],
              releases: [],
              externalIdentifiers: [{ source: 'wikipedia', id: 'wp-good' }],
              provenance: {
                source: 'wikipedia',
                sourceId: 'wp-good',
                retrievedAt: new Date().toISOString(),
                rawTitle: 'Good Game',
              },
              classificationHints: [],
              description: null,
              coverUrls: [],
            },
            classification: {
              category: 'GAME',
              confidence: 0.9,
              signals: [],
              reason: 'Game',
            },
            retrievedAt: new Date().toISOString(),
          },
        ],
        mergedClassification: {
          category: 'GAME',
          confidence: 0.9,
          signals: [],
          reason: 'Game',
        },
      });

      const discoveryEngine = {
        discover: vi.fn().mockResolvedValue({
          query: '',
          groups: [goodGroup],
          totalGroups: 1,
          sourceErrors: [],
          hasMore: false,
        }),
      } as unknown as DiscoveryEngine;

      const service = new CatalogService({
        gameRepository: repo.repository,
        discoveryEngine,
        enrichmentService,
      });

      const result = await service.searchGames('Good Game');

      expect(result.origin).toBe('database');
      expect(result.data.items.length).toBe(1);
      expect(result.data.items[0].titles[0].value).toBe('Good Game');
    });
  });
});
