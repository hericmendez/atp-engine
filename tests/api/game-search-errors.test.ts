import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/interfaces/http/app.js';
import type { CatalogService } from '../../src/application/catalog-service.js';
import { CatalogService as RealCatalogService } from '../../src/application/catalog-service.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { DiscoveryEngine } from '../../src/discovery/discovery-engine.js';
import type {
  DiscoveryResult,
  DiscoveryGroupResult,
} from '../../src/discovery/discovery-types.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { ClassificationResult } from '../../src/classification/classification-result.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGame } from '../../src/domain/game/game.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';

// ─── Builders ────────────────────────────────────────────────

const gameClassification: ClassificationResult = {
  category: 'GAME',
  confidence: 0.9,
  signals: [],
  reason: 'Test classification',
};

function makeCandidate(extId: string | null): NormalizedCandidate {
  return {
    titles: [{ value: 'Discovered Game', type: 'primary' }],
    developers: [{ name: 'Test Dev' }],
    publishers: [{ name: 'Test Pub' }],
    genres: [{ name: 'action' }],
    releases: [
      {
        platform: { name: 'PC', family: 'PC', type: 'computer' },
        region: null,
        releaseDate: null,
        version: null,
        edition: null,
        distributionChannels: [],
        launchers: [],
        externalIdentifiers: [],
      },
    ],
    externalIdentifiers:
      extId === null ? [] : [createExternalIdentifier('steam', extId)],
    provenance: {
      source: 'steam',
      sourceId: extId ?? 'no-id',
      retrievedAt: '2025-01-01T00:00:00Z',
      rawTitle: 'Discovered Game',
    },
    classificationHints: [],
    description: 'A discovered PC game',
    coverUrls: [],
    gameType: 'main_game',
    gameStatus: 'released',
    parentGameId: null,
    versionParentId: null,
  } as NormalizedCandidate;
}

function makeGroup(candidate: NormalizedCandidate): DiscoveryGroupResult {
  return {
    groupId: 'group-1',
    observations: [
      {
        source: 'steam',
        sourceId: 'steam-1',
        candidate,
        classification: gameClassification,
        retrievedAt: '2025-01-01T00:00:00Z',
      },
    ],
    mergedClassification: gameClassification,
    identityResolution: { confidence: 0.85, method: 'deterministic', matchedIdentifiers: [] },
    rankingScore: 0.8,
    rankingBreakdown: {
      identityConfidence: 0.85,
      classificationConfidence: 0.9,
      sourceCount: 1,
      observationCount: 1,
    },
  } as DiscoveryGroupResult;
}

function mockDiscoveryEngine(
  groups: DiscoveryGroupResult[],
  sourceErrors: DiscoveryResult['sourceErrors'] = [],
): DiscoveryEngine {
  return {
    discover: vi.fn(async (): Promise<DiscoveryResult> => ({
      query: '',
      groups,
      totalGroups: groups.length,
      sourceErrors,
      hasMore: false,
    })),
  } as unknown as DiscoveryEngine;
}

function mockRepository(games: Game[] = []) {
  const store = new Map<string, Game>();
  for (const g of games) {
    for (const ext of g.externalIdentifiers) {
      store.set(`${ext.source}:${ext.id}`, g);
    }
  }
  const saved: Game[] = [];
  return {
    saved,
    repository: {
      findById: async () => null,
      findByExternalIdentifier: async ({
        source,
        externalId,
      }: {
        source: string;
        externalId: string;
      }) => store.get(`${source}:${externalId}`) ?? null,
      existsByExternalIdentifier: async () => false,
      existsById: async () => false,
      findMany: async () => ({ items: games, total: games.length, page: 1, limit: 20, totalPages: 1 }),
      save: async (game: Game) => {
        saved.push(game);
      },
      update: async () => {},
      deleteById: async () => {},
    } as unknown as GameRepository,
  };
}

function makeStoredGame(): Game {
  return createGame({
    id: createGameId('atp-steam-100'),
    titles: [createGameTitle('Stored Game', 'primary')],
    developers: [createOrganization('Test Dev')],
    publishers: [createOrganization('Test Pub')],
    genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('steam', '100')],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
    gameType: 'main_game',
    gameStatus: 'released',
  });
}

// ─── Service boundary ────────────────────────────────────────

describe('discoverAndPersist error plumbing (service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('DB hit exposes no errors field and never runs discovery', async () => {
    const discoveryEngine = mockDiscoveryEngine([]);
    const service = new RealCatalogService({
      gameRepository: mockRepository([makeStoredGame()]).repository,
      discoveryEngine,
    });

    const result = await service.searchGames('Stored');

    expect(result.origin).toBe('database');
    expect(result.data.items).toHaveLength(1);
    expect(result.errors).toBeUndefined();
    expect(discoveryEngine.discover).not.toHaveBeenCalled();
  });

  it('DB miss without discover exposes no errors field', async () => {
    const discoveryEngine = mockDiscoveryEngine([]);
    const service = new RealCatalogService({
      gameRepository: mockRepository().repository,
      discoveryEngine,
    });

    const result = await service.searchGames('Missing');

    expect(result.origin).toBe('database');
    expect(result.errors).toBeUndefined();
    expect(discoveryEngine.discover).not.toHaveBeenCalled();
  });

  it('clean discovery with no results returns errors: []', async () => {
    const service = new RealCatalogService({
      gameRepository: mockRepository().repository,
      discoveryEngine: mockDiscoveryEngine([]),
    });

    const result = await service.searchGames('Missing', { discover: true });

    expect(result.origin).toBe('scraper');
    expect(result.data.items).toHaveLength(0);
    expect(result.errors).toEqual([]);
  });

  it('provider failure with no results populates sanitized errors', async () => {
    const service = new RealCatalogService({
      gameRepository: mockRepository().repository,
      discoveryEngine: mockDiscoveryEngine([], [
        {
          source: 'wikipedia',
          errorType: 'invalid_response',
          message: 'HTTP 429: https://en.wikipedia.org/w/api.php?action=query',
          retryable: true,
        },
      ]),
    });

    const result = await service.searchGames('Missing', { discover: true });

    expect(result.origin).toBe('scraper');
    expect(result.data.items).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toMatchObject({
      source: 'wikipedia',
      errorType: 'invalid_response',
      retryable: true,
    });
    expect(result.errors?.[0].message).not.toContain('https://');
  });

  it('valid result alongside provider failure keeps data, origin, and errors', async () => {
    const service = new RealCatalogService({
      gameRepository: mockRepository().repository,
      discoveryEngine: mockDiscoveryEngine([makeGroup(makeCandidate('200'))], [
        {
          source: 'wikipedia',
          errorType: 'timeout',
          message: 'Request timed out after 5000ms',
          retryable: true,
        },
      ]),
    });

    const result = await service.searchGames('Discovered', { discover: true });

    expect(result.origin).toBe('database');
    expect(result.data.items).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].source).toBe('wikipedia');
  });

  it('multiple provider failures are all preserved', async () => {
    const service = new RealCatalogService({
      gameRepository: mockRepository().repository,
      discoveryEngine: mockDiscoveryEngine([], [
        { source: 'wikipedia', errorType: 'timeout', message: 'timeout', retryable: true },
        { source: 'steam', errorType: 'network_failure', message: 'reset', retryable: true },
      ]),
    });

    const result = await service.searchGames('Missing', { discover: true });

    expect(result.errors).toHaveLength(2);
    expect(result.errors?.map((e) => e.source)).toEqual(['wikipedia', 'steam']);
  });

  it('legitimate empty discovery is not converted into an error', async () => {
    const service = new RealCatalogService({
      gameRepository: mockRepository().repository,
      discoveryEngine: mockDiscoveryEngine([makeGroup(makeCandidate(null))]),
    });

    // Identifier-less wikipedia-style group quarantines (no stable
    // identity) without any provider error present.
    const result = await service.searchGames('Missing', { discover: true });

    expect(result.data.items).toHaveLength(0);
    expect(result.errors).toEqual([]);
  });
});

// ─── HTTP boundary ───────────────────────────────────────────

function createAppWithCatalog(catalogService: CatalogService) {
  return createApp({
    games: { catalogService },
    cover: { coverService: { searchCovers: vi.fn(), getGameCover: vi.fn() } as never },
    platforms: {
      platformCatalogService: {
        listPlatforms: async () => ({
          data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
          origin: 'database' as const,
        }),
        getPlatformById: async () => {
          throw new Error('Not implemented');
        },
      } as never,
    },
    catalogSync: {
      catalogSyncService: {
        sync: async () => ({
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
        }),
      } as never,
    },
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

describe('GET /api/v1/games/search errors field (HTTP)', () => {
  it('DB hit omits the errors field (byte-identical default contract)', async () => {
    const catalogService = {
      searchGames: vi.fn(async () => ({
        data: { items: [makeStoredGame()], total: 1, page: 1, limit: 20, totalPages: 1 },
        origin: 'database' as const,
      })),
    } as unknown as CatalogService;
    const app = createAppWithCatalog(catalogService);

    const res = await request(app).get('/api/v1/games/search?q=Stored');

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('errors');
    expect(res.body.origin).toBe('database');
  });

  it('clean discovery returns errors: [] with 200', async () => {
    const catalogService = {
      searchGames: vi.fn(async () => ({
        data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
        origin: 'scraper' as const,
        errors: [],
      })),
    } as unknown as CatalogService;
    const app = createAppWithCatalog(catalogService);

    const res = await request(app).get('/api/v1/games/search?q=Missing&discover=true');

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.origin).toBe('scraper');
  });

  it('provider failure is visible over the wire with 200 and unchanged origin', async () => {
    const catalogService = {
      searchGames: vi.fn(async () => ({
        data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
        origin: 'scraper' as const,
        errors: [
          {
            source: 'wikipedia',
            errorType: 'invalid_response',
            message: 'HTTP 429:',
            retryable: true,
          },
        ],
      })),
    } as unknown as CatalogService;
    const app = createAppWithCatalog(catalogService);

    const res = await request(app).get('/api/v1/games/search?q=Missing&discover=true');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.origin).toBe('scraper');
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toMatchObject({
      source: 'wikipedia',
      errorType: 'invalid_response',
      retryable: true,
    });
    expect(JSON.stringify(res.body)).not.toContain('https://');
  });
});
