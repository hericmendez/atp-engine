import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import type {
  GameRepository,
  GameQuery,
  PaginatedResult,
} from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/shared/ids.js';
import type {
  PlatformCatalogRepository,
  PaginatedPlatformResult,
} from '../../src/domain/platform/platform-catalog-repository.js';
import type { PlatformCatalogEntry } from '../../src/domain/platform/platform-catalog.js';
import type { DiscoveryEngine } from '../../src/discovery/discovery-engine.js';
import type { DiscoveryResult, DiscoveryGroupResult } from '../../src/discovery/discovery-types.js';
import type { EnrichmentService } from '../../src/application/enrichment-service.js';
import type { EnrichmentResult } from '../../src/enrichment/enrichment-types.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGame } from '../../src/domain/game/game.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { ClassificationResult } from '../../src/classification/classification-result.js';

function createTestGame(overrides: Partial<Game> = {}): Game {
  const id = overrides.id ?? createGameId('test-game-1');
  return createGame({
    id,
    titles: overrides.titles ?? [createGameTitle('Test Game', 'primary')],
    developers: overrides.developers ?? [createOrganization('Test Dev')],
    publishers: overrides.publishers ?? [createOrganization('Test Pub')],
    genres: overrides.genres ?? [createGenre('action')],
    externalIdentifiers: overrides.externalIdentifiers ?? [],
    classification: overrides.classification ?? 'GAME',
    completeness: overrides.completeness ?? 'FOUND_PARTIAL',
  });
}

function createMockGameRepository(): GameRepository {
  const store = new Map<string, Game>();

  return {
    findById: vi.fn(async (id: GameId) => store.get(id) ?? null),
    findByExternalIdentifier: vi.fn(async () => null),
    existsByExternalIdentifier: vi.fn(async () => false),
    existsById: vi.fn(async (id: GameId) => store.has(id)),
    findMany: vi.fn(async (query: GameQuery): Promise<PaginatedResult<Game>> => {
      const filtered = [...store.values()];
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const start = (page - 1) * limit;
      const items = filtered.slice(start, start + limit);
      return {
        items,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      };
    }),
    save: vi.fn(async (game: Game) => {
      store.set(game.id, game);
    }),
    update: vi.fn(async (game: Game) => {
      store.set(game.id, game);
    }),
    deleteById: vi.fn(async (id: GameId) => {
      store.delete(id);
    }),
  };
}

function createMockPlatformCatalogRepository(
  platforms: PlatformCatalogEntry[] = [],
): PlatformCatalogRepository {
  const store = new Map<string, PlatformCatalogEntry>();
  for (const p of platforms) {
    store.set(p.id, p);
  }

  return {
    findById: vi.fn(async (id: string) => {
      const entry = store.get(id);
      if (!entry) return null;
      return { ...entry, gameCount: 0 };
    }),
    findMany: vi.fn(async (query): Promise<PaginatedPlatformResult> => {
      let filtered = [...store.values()];
      if (query.status) {
        filtered = filtered.filter((p) => p.status === query.status);
      }
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const start = (page - 1) * limit;
      const items = filtered.slice(start, start + limit).map((p) => ({ ...p, gameCount: 0 }));
      return {
        items,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      };
    }),
    findByCompany: vi.fn(async () => []),
    upsert: vi.fn(async () => {}),
  };
}

function createMockDiscoveryEngine(groups: DiscoveryGroupResult[] = []): DiscoveryEngine {
  return {
    discover: vi.fn(async (): Promise<DiscoveryResult> => ({
      query: '',
      groups,
      totalGroups: groups.length,
      sourceErrors: [],
      hasMore: false,
    })),
  } as unknown as DiscoveryEngine;
}

function createMockEnrichmentService(): EnrichmentService {
  return {
    enrich: vi.fn(async (game: Game, _observations): Promise<EnrichmentResult> => ({
      game,
      changes: [],
      conflicts: [],
      completeness: 'FOUND_PARTIAL',
    })),
  } as unknown as EnrichmentService;
}

function createTestPlatform(overrides: Partial<PlatformCatalogEntry> = {}): PlatformCatalogEntry {
  return {
    id: overrides.id ?? 'nintendo-switch',
    name: overrides.name ?? 'Nintendo Switch',
    company: overrides.company ?? 'Nintendo',
    releaseYear: overrides.releaseYear ?? 2017,
    status: overrides.status ?? 'active',
    family: overrides.family ?? 'Nintendo',
    type: overrides.type ?? 'handheld',
    thumb: overrides.thumb ?? null,
  };
}

const activePlatform = createTestPlatform({
  id: 'nintendo-switch',
  name: 'Nintendo Switch',
  status: 'active',
});
const secondActivePlatform = createTestPlatform({
  id: 'xbox-series-x',
  name: 'Xbox Series X',
  status: 'active',
  company: 'Microsoft',
  family: 'Xbox',
  type: 'console',
});
const inactivePlatform = createTestPlatform({
  id: 'ps4',
  name: 'PlayStation 4',
  status: 'inactive',
});

function createTestDiscoveryGroup(
  overrides: Partial<DiscoveryGroupResult> = {},
): DiscoveryGroupResult {
  const defaultCandidate: NormalizedCandidate = {
    titles: [{ value: 'Test Game', type: 'primary' }],
    developers: [{ name: 'Test Dev' }],
    publishers: [{ name: 'Test Pub' }],
    genres: [{ name: 'action' }],
    releases: [
      {
        platform: { name: 'Nintendo Switch', family: 'Nintendo', type: 'handheld' },
        region: null,
        releaseDate: null,
        version: null,
        edition: null,
        distributionChannels: [],
        launchers: [],
        externalIdentifiers: [],
      },
    ],
    externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-123')],
    provenance: {
      source: 'wikipedia',
      sourceId: 'wp-1',
      retrievedAt: '2025-01-01T00:00:00Z',
      rawTitle: 'Test Game',
    },
    classificationHints: [],
    description: 'A test game for Nintendo Switch',
    coverUrls: [],
  };

  const defaultClassification: ClassificationResult = {
    category: 'GAME',
    confidence: 0.9,
    signals: [],
    reason: 'Test classification',
  };

  return {
    groupId: overrides.groupId ?? 'group-1',
    observations: overrides.observations ?? [
      {
        source: 'wikipedia',
        sourceId: 'wp-1',
        candidate: defaultCandidate,
        classification: defaultClassification,
        retrievedAt: '2025-01-01T00:00:00Z',
      },
    ],
    mergedClassification: overrides.mergedClassification ?? defaultClassification,
    identityResolution: overrides.identityResolution ?? {
      confidence: 0.85,
      method: 'deterministic',
      matchedIdentifiers: [],
    },
    rankingScore: overrides.rankingScore ?? 0.8,
    rankingBreakdown: overrides.rankingBreakdown ?? {
      identityConfidence: 0.85,
      classificationConfidence: 0.9,
      sourceCount: 1,
      metadataCompleteness: 0.7,
      titleRelevance: 0.8,
    },
  };
}

describe('CatalogSyncService', () => {
  let gameRepository: ReturnType<typeof createMockGameRepository>;
  let platformCatalogRepository: ReturnType<typeof createMockPlatformCatalogRepository>;
  let discoveryEngine: ReturnType<typeof createMockDiscoveryEngine>;
  let enrichmentService: ReturnType<typeof createMockEnrichmentService>;
  let service: CatalogSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    gameRepository = createMockGameRepository();
    platformCatalogRepository = createMockPlatformCatalogRepository([
      activePlatform,
      secondActivePlatform,
      inactivePlatform,
    ]);
    discoveryEngine = createMockDiscoveryEngine();
    enrichmentService = createMockEnrichmentService();
    service = new CatalogSyncService({
      gameRepository,
      platformCatalogRepository,
      discoveryEngine,
      enrichmentService,
    });
  });

  describe('sync()', () => {
    it('returns empty result when no platforms match', async () => {
      const result = await service.sync({
        platforms: ['nonexistent-platform'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.status).toBe('completed');
      expect(result.platforms).toHaveLength(0);
      expect(result.totals.candidatesFound).toBe(0);
    });

    it('syncs a single platform by ID', async () => {
      const group = createTestDiscoveryGroup();
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: 'Nintendo Switch games 2025',
        groups: [group],
        totalGroups: 1,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.status).toBe('completed');
      expect(result.platforms).toHaveLength(1);
      expect(result.platforms[0].platformName).toBe('Nintendo Switch');
      expect(result.platforms[0].candidatesFound).toBe(1);
      expect(result.platforms[0].newGames).toBe(1);
      expect(result.totals.newGames).toBe(1);
      expect(discoveryEngine.discover).toHaveBeenCalledWith({
        query: 'Nintendo Switch games 2025',
        limit: 100,
      });
      expect(gameRepository.save).toHaveBeenCalled();
    });

    it('syncs all active platforms when activeOnly=true', async () => {
      const group = createTestDiscoveryGroup();
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [group],
        totalGroups: 1,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        activeOnly: true,
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.status).toBe('completed');
      expect(result.platforms.length).toBeGreaterThanOrEqual(1);
      expect(result.platforms.some((p) => p.platformName === 'Nintendo Switch')).toBe(true);
    });

    it('rejects non-GAME classifications', async () => {
      const nonGameGroup = createTestDiscoveryGroup({
        mergedClassification: {
          category: 'FRANCHISE',
          confidence: 0.8,
          signals: [],
          reason: 'Not a game',
        },
      });
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [nonGameGroup],
        totalGroups: 1,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.platforms[0].rejected).toBe(1);
      expect(result.platforms[0].newGames).toBe(0);
      expect(gameRepository.save).not.toHaveBeenCalled();
    });

    it('returns dry run without persisting', async () => {
      const group = createTestDiscoveryGroup();
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [group],
        totalGroups: 1,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.platforms[0].newGames).toBe(1);
      expect(gameRepository.save).not.toHaveBeenCalled();
    });

    it('enriches existing games when found by external ID', async () => {
      const existingGame = createTestGame({
        id: createGameId('existing-game-1'),
        externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-123')],
      });

      vi.mocked(gameRepository.findByExternalIdentifier).mockResolvedValue(existingGame);
      vi.mocked(enrichmentService.enrich).mockResolvedValue({
        game: existingGame,
        changes: [{ field: 'description', oldValue: null, newValue: 'Updated' }],
        conflicts: [],
        completeness: 'FOUND_COMPLETE',
      });

      const group = createTestDiscoveryGroup();
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [group],
        totalGroups: 1,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.platforms[0].updatedGames).toBe(1);
      expect(result.platforms[0].existingGames).toBe(0);
      expect(enrichmentService.enrich).toHaveBeenCalled();
      expect(gameRepository.save).not.toHaveBeenCalled();
    });

    it('counts as existing when enrichment produces no changes', async () => {
      const existingGame = createTestGame({
        id: createGameId('existing-game-2'),
        externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-456')],
      });

      vi.mocked(gameRepository.findByExternalIdentifier).mockResolvedValue(existingGame);
      vi.mocked(enrichmentService.enrich).mockResolvedValue({
        game: existingGame,
        changes: [],
        conflicts: [],
        completeness: 'FOUND_PARTIAL',
      });

      const group = createTestDiscoveryGroup();
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [group],
        totalGroups: 1,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.platforms[0].existingGames).toBe(1);
      expect(result.platforms[0].updatedGames).toBe(0);
    });

    it('handles platform discovery errors gracefully', async () => {
      vi.mocked(discoveryEngine.discover).mockRejectedValue(new Error('Discovery failed'));

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.status).toBe('failed');
      expect(result.platforms[0].status).toBe('failed');
      expect(result.platforms[0].error).toBe('Discovery failed');
    });

    it('returns partial status when some platforms fail', async () => {
      vi.mocked(discoveryEngine.discover)
        .mockResolvedValueOnce({
          query: '',
          groups: [],
          totalGroups: 0,
          sourceErrors: [],
          hasMore: false,
        })
        .mockRejectedValueOnce(new Error('Platform 2 failed'));

      const result = await service.sync({
        activeOnly: true,
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.status).toBe('partial');
    });

    it('ignores duplicate platform IDs', async () => {
      const group = createTestDiscoveryGroup();
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [group],
        totalGroups: 1,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        platforms: ['nintendo-switch', 'nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.platforms).toHaveLength(1);
      expect(discoveryEngine.discover).toHaveBeenCalledTimes(1);
    });

    it('filters candidates by platform relevance', async () => {
      const switchGroup = createTestDiscoveryGroup({
        groupId: 'switch-game',
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'wp-1',
            candidate: {
              ...createTestDiscoveryGroup().observations[0].candidate,
              releases: [
                {
                  platform: { name: 'Nintendo Switch', family: 'Nintendo', type: 'handheld' },
                  region: null,
                  releaseDate: null,
                  version: null,
                  edition: null,
                  distributionChannels: [],
                  launchers: [],
                  externalIdentifiers: [],
                },
              ],
            },
            classification: { category: 'GAME', confidence: 0.9, signals: [], reason: 'Test' },
            retrievedAt: '2025-01-01T00:00:00Z',
          },
        ],
      });

      const psGroup = createTestDiscoveryGroup({
        groupId: 'ps-game',
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'wp-2',
            candidate: {
              ...createTestDiscoveryGroup().observations[0].candidate,
              titles: [{ value: 'PS5 Game', type: 'primary' }],
              releases: [
                {
                  platform: { name: 'PlayStation 5', family: 'PlayStation', type: 'console' },
                  region: null,
                  releaseDate: null,
                  version: null,
                  edition: null,
                  distributionChannels: [],
                  launchers: [],
                  externalIdentifiers: [],
                },
              ],
              description: 'A PS5 game',
            },
            classification: { category: 'GAME', confidence: 0.9, signals: [], reason: 'Test' },
            retrievedAt: '2025-01-01T00:00:00Z',
          },
        ],
      });

      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [switchGroup, psGroup],
        totalGroups: 2,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.platforms[0].candidatesFound).toBe(1);
      expect(result.platforms[0].newGames).toBe(1);
    });

    it('builds correct query string with year', async () => {
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [],
        totalGroups: 0,
        sourceErrors: [],
        hasMore: false,
      });

      await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(discoveryEngine.discover).toHaveBeenCalledWith({
        query: 'Nintendo Switch games 2025',
        limit: 100,
      });
    });

    it('returns failed status when all platforms fail', async () => {
      vi.mocked(discoveryEngine.discover).mockRejectedValue(new Error('All failed'));

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.status).toBe('failed');
    });

    it('handles empty date range gracefully', async () => {
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [],
        totalGroups: 0,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: 'invalid-date',
        to: 'invalid-date',
      });

      expect(result.status).toBe('completed');
      expect(discoveryEngine.discover).toHaveBeenCalledWith({
        query: 'Nintendo Switch games',
        limit: 100,
      });
    });

    it('returns duration in result', async () => {
      vi.mocked(discoveryEngine.discover).mockResolvedValue({
        query: '',
        groups: [],
        totalGroups: 0,
        sourceErrors: [],
        hasMore: false,
      });

      const result = await service.sync({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('aggregates totals across multiple platforms', async () => {
      const group1 = createTestDiscoveryGroup({
        groupId: 'g1',
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'wp-1',
            candidate: {
              ...createTestDiscoveryGroup().observations[0].candidate,
              titles: [{ value: 'Game One', type: 'primary' }],
              externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-001')],
            },
            classification: { category: 'GAME', confidence: 0.9, signals: [], reason: 'Test' },
            retrievedAt: '2025-01-01T00:00:00Z',
          },
        ],
      });
      const group2 = createTestDiscoveryGroup({
        groupId: 'g2',
        observations: [
          {
            source: 'wikipedia',
            sourceId: 'wp-2',
            candidate: {
              ...createTestDiscoveryGroup().observations[0].candidate,
              titles: [{ value: 'Game Two', type: 'primary' }],
              externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-002')],
              releases: [
                {
                  platform: { name: 'Xbox Series X', family: 'Xbox', type: 'console' },
                  region: null,
                  releaseDate: null,
                  version: null,
                  edition: null,
                  distributionChannels: [],
                  launchers: [],
                  externalIdentifiers: [],
                },
              ],
              description: 'An Xbox game',
            },
            classification: { category: 'GAME', confidence: 0.9, signals: [], reason: 'Test' },
            retrievedAt: '2025-01-01T00:00:00Z',
          },
        ],
      });

      vi.mocked(discoveryEngine.discover)
        .mockResolvedValueOnce({
          query: '',
          groups: [group1],
          totalGroups: 1,
          sourceErrors: [],
          hasMore: false,
        })
        .mockResolvedValueOnce({
          query: '',
          groups: [group2],
          totalGroups: 1,
          sourceErrors: [],
          hasMore: false,
        });

      const result = await service.sync({
        activeOnly: true,
        from: '2025-01-01',
        to: '2025-12-31',
      });

      expect(result.platforms.length).toBe(2);
      expect(result.totals.candidatesFound).toBe(2);
      expect(result.totals.newGames).toBe(2);
    });
  });
});

describe('POST /api/v1/catalog/sync', () => {
  let app: ReturnType<typeof import('../../src/interfaces/http/app.js').createApp>;
  let mockCatalogSyncService: CatalogSyncService;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockCatalogSyncService = {
      sync: vi.fn(),
    } as unknown as CatalogSyncService;

    const { createApp } = await import('../../src/interfaces/http/app.js');
    app = createApp({
      games: {
        catalogService: {
          listGames: async () => ({
            data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
            origin: 'database',
          }),
          searchGames: async () => ({
            data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
            origin: 'database',
          }),
          getGameById: async () => {
            throw new Error('Not implemented');
          },
        },
      },
      cover: {
        coverService: {
          searchCovers: async () => ({
            data: {
              query: '',
              gameId: null,
              type: 'cover',
              limit: 1,
              selected: null,
              candidates: [],
              errors: [],
            },
            origin: 'scraper',
          }),
          getGameCover: async () => ({
            data: {
              query: '',
              gameId: '',
              type: 'cover',
              limit: 1,
              selected: null,
              candidates: [],
              errors: [],
            },
            origin: 'database',
          }),
        },
      },
      platforms: {
        platformCatalogService: {
          listPlatforms: async () => ({
            data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
            origin: 'database',
          }),
          getPlatformById: async () => {
            throw new Error('Not implemented');
          },
        },
      },
      catalogSync: { catalogSyncService: mockCatalogSyncService },
    });
  });

  it('returns 200 with sync result', async () => {
    const request = (await import('supertest')).default;
    vi.mocked(mockCatalogSyncService.sync).mockResolvedValue({
      status: 'completed',
      platforms: [
        {
          platformId: 'nintendo-switch',
          platformName: 'Nintendo Switch',
          candidatesFound: 5,
          newGames: 3,
          existingGames: 1,
          updatedGames: 0,
          rejected: 1,
          errors: 0,
          status: 'completed',
        },
      ],
      totals: {
        candidatesFound: 5,
        newGames: 3,
        existingGames: 1,
        updatedGames: 0,
        rejected: 1,
        errors: 0,
      },
      dryRun: false,
      durationMs: 1234,
    });

    const res = await request(app)
      .post('/api/v1/catalog/sync')
      .send({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.platforms).toHaveLength(1);
    expect(res.body.data.dryRun).toBe(false);
  });

  it('returns validation error when neither platforms nor activeOnly', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/v1/catalog/sync').send({
      from: '2025-01-01',
      to: '2025-12-31',
    });

    expect(res.status).toBe(400);
  });

  it('accepts activeOnly instead of platforms', async () => {
    const request = (await import('supertest')).default;
    vi.mocked(mockCatalogSyncService.sync).mockResolvedValue({
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
    });

    const res = await request(app).post('/api/v1/catalog/sync').send({
      activeOnly: true,
      from: '2025-01-01',
      to: '2025-12-31',
    });

    expect(res.status).toBe(200);
    expect(mockCatalogSyncService.sync).toHaveBeenCalledWith({
      activeOnly: true,
      from: '2025-01-01',
      to: '2025-12-31',
      dryRun: false,
    });
  });

  it('returns 400 for invalid date', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/v1/catalog/sync')
      .send({
        platforms: ['nintendo-switch'],
        from: 'not-a-date',
        to: '2025-12-31',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when from date is after to date', async () => {
    const request = (await import('supertest')).default;
    const res = await request(app)
      .post('/api/v1/catalog/sync')
      .send({
        platforms: ['nintendo-switch'],
        from: '2025-12-31',
        to: '2025-01-01',
      });

    expect(res.status).toBe(400);
  });

  it('passes dryRun flag to service', async () => {
    const request = (await import('supertest')).default;
    vi.mocked(mockCatalogSyncService.sync).mockResolvedValue({
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
      dryRun: true,
      durationMs: 0,
    });

    await request(app)
      .post('/api/v1/catalog/sync')
      .send({
        platforms: ['nintendo-switch'],
        from: '2025-01-01',
        to: '2025-12-31',
        dryRun: true,
      });

    expect(mockCatalogSyncService.sync).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });
});
