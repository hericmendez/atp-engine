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
import type { CatalogSyncHistoryRepository } from '../../src/application/catalog-sync-history-repository.js';
import type { CatalogSyncHistory } from '../../src/application/catalog-sync-history-types.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { ClassificationResult } from '../../src/classification/classification-result.js';

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
  for (const p of platforms) store.set(p.id, p);
  return {
    findById: vi.fn(async (id: string) => {
      const entry = store.get(id);
      if (!entry) return null;
      return { ...entry, gameCount: 0 };
    }),
    findMany: vi.fn(async (query): Promise<PaginatedPlatformResult> => {
      let filtered = [...store.values()];
      if (query.status) filtered = filtered.filter((p) => p.status === query.status);
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
    enrich: vi.fn(async (game: Game): Promise<EnrichmentResult> => ({
      game,
      changes: [],
      conflicts: [],
      completeness: 'FOUND_PARTIAL',
    })),
  } as unknown as EnrichmentService;
}

function createMockHistoryRepository(): CatalogSyncHistoryRepository {
  const store = new Map<string, CatalogSyncHistory>();
  let nextId = 1;

  return {
    create: vi.fn(async (entry: Omit<CatalogSyncHistory, 'id'>): Promise<string> => {
      const id = `history-${nextId++}`;
      store.set(id, { ...entry, id } as CatalogSyncHistory);
      return id;
    }),
    update: vi.fn(async (id: string, updates: Partial<CatalogSyncHistory>): Promise<void> => {
      const existing = store.get(id);
      if (!existing) throw new Error(`Not found: ${id}`);
      store.set(id, { ...existing, ...updates } as CatalogSyncHistory);
    }),
    findById: vi.fn(async (id: string): Promise<CatalogSyncHistory | null> => {
      return store.get(id) ?? null;
    }),
    findMany: vi.fn(
      async (
        _query,
      ): Promise<{
        items: readonly CatalogSyncHistory[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }> => {
        const items = [...store.values()];
        return { items, total: items.length, page: 1, limit: 20, totalPages: 1 };
      },
    ),
  };
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

const activePlatform = createTestPlatform({
  id: 'nintendo-switch',
  name: 'Nintendo Switch',
  status: 'active',
});

describe('CatalogSyncService — History Integration', () => {
  let gameRepository: ReturnType<typeof createMockGameRepository>;
  let platformCatalogRepository: ReturnType<typeof createMockPlatformCatalogRepository>;
  let discoveryEngine: ReturnType<typeof createMockDiscoveryEngine>;
  let enrichmentService: ReturnType<typeof createMockEnrichmentService>;
  let historyRepository: ReturnType<typeof createMockHistoryRepository>;
  let service: CatalogSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    gameRepository = createMockGameRepository();
    platformCatalogRepository = createMockPlatformCatalogRepository([activePlatform]);
    discoveryEngine = createMockDiscoveryEngine();
    enrichmentService = createMockEnrichmentService();
    historyRepository = createMockHistoryRepository();
    service = new CatalogSyncService({
      gameRepository,
      platformCatalogRepository,
      discoveryEngine,
      enrichmentService,
      historyRepository,
    });
  });

  it('creates a history record when sync starts', async () => {
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

    expect(historyRepository.create).toHaveBeenCalledTimes(1);
    const createCall = vi.mocked(historyRepository.create).mock.calls[0][0];
    expect(createCall.status).toBe('running');
    expect(createCall.trigger).toBe('manual');
    expect(createCall.dryRun).toBe(false);
    expect(createCall.requestedPlatformIds).toEqual(['nintendo-switch']);
    expect(createCall.from).toBe('2025-01-01');
    expect(createCall.to).toBe('2025-12-31');
  });

  it('updates history record when sync completes', async () => {
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

    expect(historyRepository.update).toHaveBeenCalled();
    const updateCall = vi.mocked(historyRepository.update).mock.calls[0];
    const updates = updateCall[1] as Partial<CatalogSyncHistory>;
    expect(updates.status).toBe('completed');
    expect(updates.completedAt).toBeInstanceOf(Date);
    expect(updates.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns historyId in SyncResult', async () => {
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

    expect(result.historyId).toBeDefined();
    expect(typeof result.historyId).toBe('string');
  });

  it('records trigger=manual by default', async () => {
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

    const createCall = vi.mocked(historyRepository.create).mock.calls[0][0];
    expect(createCall.trigger).toBe('manual');
  });

  it('records trigger=scheduled when specified', async () => {
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
      trigger: 'scheduled',
    });

    const createCall = vi.mocked(historyRepository.create).mock.calls[0][0];
    expect(createCall.trigger).toBe('scheduled');
  });

  it('records dry run in history', async () => {
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
      dryRun: true,
    });

    const createCall = vi.mocked(historyRepository.create).mock.calls[0][0];
    expect(createCall.dryRun).toBe(true);
  });

  it('updates history with platform results', async () => {
    const group = createTestDiscoveryGroup();
    vi.mocked(discoveryEngine.discover).mockResolvedValue({
      query: '',
      groups: [group],
      totalGroups: 1,
      sourceErrors: [],
      hasMore: false,
    });

    await service.sync({
      platforms: ['nintendo-switch'],
      from: '2025-01-01',
      to: '2025-12-31',
    });

    const updateCall = vi.mocked(historyRepository.update).mock.calls[0];
    const updates = updateCall[1] as Partial<CatalogSyncHistory>;
    expect(updates.platformResults).toBeDefined();
    expect(updates.platformResults!.length).toBe(1);
    expect(updates.totals).toBeDefined();
  });

  it('updates history with failed status on total failure', async () => {
    vi.mocked(discoveryEngine.discover).mockRejectedValue(new Error('Database unavailable'));

    await service.sync({
      platforms: ['nintendo-switch'],
      from: '2025-01-01',
      to: '2025-12-31',
    });

    const updateCall = vi.mocked(historyRepository.update).mock.calls[0];
    const updates = updateCall[1] as Partial<CatalogSyncHistory>;
    expect(updates.status).toBe('failed');
    expect(updates.error).toContain('Database unavailable');
  });

  it('updates history with partial status when some platforms fail', async () => {
    const secondPlatform = createTestPlatform({
      id: 'xbox-series-x',
      name: 'Xbox Series X',
      status: 'active',
      company: 'Microsoft',
      family: 'Xbox',
      type: 'console',
    });
    platformCatalogRepository = createMockPlatformCatalogRepository([
      activePlatform,
      secondPlatform,
    ]);
    service = new CatalogSyncService({
      gameRepository,
      platformCatalogRepository,
      discoveryEngine,
      enrichmentService,
      historyRepository,
    });

    vi.mocked(discoveryEngine.discover)
      .mockResolvedValueOnce({
        query: '',
        groups: [],
        totalGroups: 0,
        sourceErrors: [],
        hasMore: false,
      })
      .mockRejectedValueOnce(new Error('Platform 2 failed'));

    await service.sync({
      activeOnly: true,
      from: '2025-01-01',
      to: '2025-12-31',
    });

    const updateCall = vi.mocked(historyRepository.update).mock.calls[0];
    const updates = updateCall[1] as Partial<CatalogSyncHistory>;
    expect(updates.status).toBe('partial');
  });

  it('does not create history when repository is not provided', async () => {
    const serviceNoHistory = new CatalogSyncService({
      gameRepository,
      platformCatalogRepository,
      discoveryEngine,
      enrichmentService,
    });

    vi.mocked(discoveryEngine.discover).mockResolvedValue({
      query: '',
      groups: [],
      totalGroups: 0,
      sourceErrors: [],
      hasMore: false,
    });

    const result = await serviceNoHistory.sync({
      platforms: ['nintendo-switch'],
      from: '2025-01-01',
      to: '2025-12-31',
    });

    expect(result.historyId).toBeUndefined();
  });

  it('continues sync even if history creation fails', async () => {
    vi.mocked(historyRepository.create).mockRejectedValue(new Error('MongoDB write error'));
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

    expect(result.status).toBe('completed');
    expect(result.historyId).toBeUndefined();
  });

  it('records resolved platform names in history', async () => {
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

    const updateCall = vi.mocked(historyRepository.update).mock.calls[0];
    const updates = updateCall[1] as Partial<CatalogSyncHistory>;
    expect(updates.resolvedPlatformNames).toEqual(['Nintendo Switch']);
  });
});

describe('POST /api/v1/catalog/sync — trigger parameter', () => {
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
      catalogSyncHistory: {
        historyRepository: {
          create: vi.fn(),
          update: vi.fn(),
          findById: vi.fn(),
          findMany: vi.fn(),
        },
      },
    });
  });

  it('defaults trigger to manual when not specified', async () => {
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

    await request(app)
      .post('/api/v1/catalog/sync')
      .send({ platforms: ['nintendo-switch'], from: '2025-01-01', to: '2025-12-31' });

    expect(mockCatalogSyncService.sync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'manual' }),
    );
  });
});
