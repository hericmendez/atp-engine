import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import { CatalogService } from '../../src/application/catalog-service.js';
import { QuarantineService } from '../../src/application/quarantine-service.js';
import {
  findOriginalEdgeRequest,
  withOriginalEdge,
} from '../../src/application/relationships.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/shared/ids.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGame } from '../../src/domain/game/game.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { DiscoveryEngine } from '../../src/discovery/discovery-engine.js';
import type {
  DiscoveryResult,
  DiscoveryGroupResult,
  DiscoverySourceObservation,
} from '../../src/discovery/discovery-types.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';
import type { ClassificationResult } from '../../src/classification/classification-result.js';
import type { QuarantineRepository } from '../../src/application/quarantine-repository.js';
import type { PlatformCatalogRepository } from '../../src/domain/platform/platform-catalog-repository.js';
import type { PlatformCatalogEntry } from '../../src/domain/platform/platform-catalog.js';
import type { EnrichmentService } from '../../src/application/enrichment-service.js';

// ─── Builders ────────────────────────────────────────────────

function makeCandidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    titles: [{ value: 'Remade Game', type: 'primary' }],
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
    externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-remake-200')],
    provenance: {
      source: 'igdb',
      sourceId: 'igdb-remake-200',
      retrievedAt: '2025-01-01T00:00:00Z',
      rawTitle: 'Remade Game',
    },
    classificationHints: [],
    description: 'A Nintendo Switch remake for testing',
    coverUrls: [],
    gameType: 'remake',
    gameStatus: 'released',
    parentGameId: 'igdb-orig-100',
    versionParentId: null,
    ...overrides,
  } as NormalizedCandidate;
}

const gameClassification: ClassificationResult = {
  category: 'GAME',
  confidence: 0.9,
  signals: [],
  reason: 'Test classification',
};

function makeGroup(
  candidate: NormalizedCandidate,
  groupId = 'group-remake',
  sourceId = 'igdb-remake-200',
): DiscoveryGroupResult {
  const observation: DiscoverySourceObservation = {
    source: 'igdb',
    sourceId,
    candidate,
    classification: gameClassification,
    retrievedAt: '2025-01-01T00:00:00Z',
  };
  return {
    groupId,
    observations: [observation],
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

function makeOriginal(): Game {
  return createGame({
    id: createGameId('atp-igdb-igdb-orig-100'),
    titles: [createGameTitle('Original Game', 'primary')],
    developers: [createOrganization('Test Dev')],
    publishers: [createOrganization('Test Pub')],
    genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-orig-100')],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
    gameType: 'main_game',
    gameStatus: 'released',
  });
}

// ─── Mocks ───────────────────────────────────────────────────

function createMockGameRepository(index: Map<string, Game>): GameRepository {
  return {
    findById: vi.fn(async (id: GameId) => [...index.values()].find((g) => g.id === id) ?? null),
    findByExternalIdentifier: vi.fn(
      async ({ source, externalId }: { source: string; externalId: string }) =>
        index.get(`${source}:${externalId}`) ?? null,
    ),
    existsByExternalIdentifier: vi.fn(async () => false),
    existsById: vi.fn(async () => false),
    findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
    save: vi.fn(async (game: Game) => {
      for (const ext of game.externalIdentifiers) {
        index.set(`${ext.source}:${ext.id}`, game);
      }
    }),
    update: vi.fn(async (game: Game) => {
      for (const ext of game.externalIdentifiers) {
        index.set(`${ext.source}:${ext.id}`, game);
      }
    }),
    deleteById: vi.fn(async () => {}),
  };
}

const switchPlatform: PlatformCatalogEntry = {
  id: 'nintendo-switch',
  name: 'Nintendo Switch',
  company: 'Nintendo',
  releaseYear: 2017,
  status: 'active',
  family: 'Nintendo',
  type: 'handheld',
  thumb: null,
};

function runSync(
  gameRepository: GameRepository,
  groups: DiscoveryGroupResult[],
  quarantineRepository?: QuarantineRepository,
) {
  const service = new CatalogSyncService({
    gameRepository,
    platformCatalogRepository: {
      findById: vi.fn(async (id: string) =>
        id === switchPlatform.id ? { ...switchPlatform, gameCount: 0 } : null,
      ),
      findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
      findByCompany: vi.fn(async () => []),
      upsert: vi.fn(async () => {}),
    } as PlatformCatalogRepository,
    discoveryEngine: {
      discover: vi.fn(async (): Promise<DiscoveryResult> => ({
        query: '',
        groups,
        totalGroups: groups.length,
        sourceErrors: [],
        hasMore: false,
      })),
    } as unknown as DiscoveryEngine,
    enrichmentService: {
      enrich: vi.fn(async (game: Game) => ({
        game,
        changes: [],
        conflicts: [],
        completeness: 'FOUND_PARTIAL' as const,
      })),
    } as unknown as EnrichmentService,
    ...(quarantineRepository
      ? { quarantineService: new QuarantineService({ quarantineRepository }) }
      : {}),
  });
  return service.sync({
    platforms: ['nintendo-switch'],
    from: '2025-01-01',
    to: '2025-12-31',
  });
}

function createMockQuarantineRepository() {
  const records: { reason: string }[] = [];
  return {
    records,
    repository: {
      record: vi.fn(async (entry: { reason: string }) => {
        records.push({ reason: entry.reason });
      }),
      findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
      count: vi.fn(async () => 0),
    } as unknown as QuarantineRepository,
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe('remake/remaster relationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('withOriginalEdge is idempotent at the domain level', () => {
    const game = makeOriginal();
    const targetId = createGameId('atp-igdb-igdb-orig-100-x') as GameId;

    const first = withOriginalEdge(game, targetId, 'REMAKE');
    expect(first.added).toBe(true);
    expect(first.game.relationships).toHaveLength(1);
    expect(first.game.relationships[0]).toMatchObject({
      sourceGameId: game.id,
      targetGameId: targetId,
      type: 'REMAKE',
    });

    const second = withOriginalEdge(first.game, targetId, 'REMAKE');
    expect(second.added).toBe(false);
    expect(second.game.relationships).toHaveLength(1);
  });

  it('findOriginalEdgeRequest ignores non-remake types and missing refs', () => {
    const mainGroup = makeGroup(makeCandidate({ gameType: 'main_game', parentGameId: null }));
    expect(findOriginalEdgeRequest(mainGroup)).toBeNull();

    const refLess = makeGroup(makeCandidate({ parentGameId: null, versionParentId: null }));
    expect(findOriginalEdgeRequest(refLess)).toBeNull();

    const remake = makeGroup(makeCandidate());
    expect(findOriginalEdgeRequest(remake)).toMatchObject({
      kind: 'REMAKE',
      ref: { field: 'parent_game', externalId: 'igdb-orig-100' },
    });
  });

  it('new remake persists as its own canonical game with a REMAKE edge', async () => {
    const index = new Map<string, Game>([['igdb:igdb-orig-100', makeOriginal()]]);
    const gameRepository = createMockGameRepository(index);

    const result = await runSync(gameRepository, [makeGroup(makeCandidate())]);

    expect(result.totals.newGames).toBe(1);
    const remake = index.get('igdb:igdb-remake-200');
    expect(remake).toBeDefined();
    // Identity separation: distinct canonical ids.
    expect(remake?.id).not.toBe('atp-igdb-igdb-orig-100');
    expect(remake?.relationships).toHaveLength(1);
    expect(remake?.relationships[0]).toMatchObject({
      sourceGameId: remake?.id,
      targetGameId: 'atp-igdb-igdb-orig-100',
      type: 'REMAKE',
    });
    // Original untouched.
    expect(index.get('igdb:igdb-orig-100')?.relationships).toHaveLength(0);
  });

  it('re-ingestion does not duplicate the edge', async () => {
    const index = new Map<string, Game>([['igdb:igdb-orig-100', makeOriginal()]]);
    const gameRepository = createMockGameRepository(index);

    await runSync(gameRepository, [makeGroup(makeCandidate())]);
    expect(index.get('igdb:igdb-remake-200')?.relationships).toHaveLength(1);

    vi.mocked(gameRepository.update).mockClear();
    const second = await runSync(gameRepository, [makeGroup(makeCandidate(), 'group-remake-2')]);

    expect(second.totals.existingGames).toBe(1);
    expect(gameRepository.update).not.toHaveBeenCalled();
    expect(index.get('igdb:igdb-remake-200')?.relationships).toHaveLength(1);
  });

  it('remaster creates a REMASTER edge', async () => {
    const index = new Map<string, Game>([['igdb:igdb-orig-100', makeOriginal()]]);
    const gameRepository = createMockGameRepository(index);

    const candidate = makeCandidate({
      gameType: 'remaster',
      externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-remaster-300')],
      provenance: {
        source: 'igdb',
        sourceId: 'igdb-remaster-300',
        retrievedAt: '2025-01-01T00:00:00Z',
        rawTitle: 'Remade Game',
      },
    });
    await runSync(gameRepository, [makeGroup(candidate, 'group-remaster', 'igdb-remaster-300')]);

    const remaster = index.get('igdb:igdb-remaster-300');
    expect(remaster?.relationships).toHaveLength(1);
    expect(remaster?.relationships[0].type).toBe('REMASTER');
  });

  it('missing original defers; late original in the same run resolves the edge', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);

    const originalCandidate = makeCandidate({
      gameType: 'main_game',
      gameStatus: 'released',
      parentGameId: null,
      titles: [{ value: 'Original Game', type: 'primary' }],
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
      externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-orig-100')],
      description: 'Original game also on Nintendo Switch',
      provenance: {
        source: 'igdb',
        sourceId: 'igdb-orig-100',
        retrievedAt: '2025-01-01T00:00:00Z',
        rawTitle: 'Original Game',
      },
    });

    const result = await runSync(gameRepository, [
      makeGroup(makeCandidate(), 'group-remake'),
      makeGroup(originalCandidate, 'group-original', 'igdb-orig-100'),
    ]);

    expect(result.totals.newGames).toBe(2);
    expect(result.totals.rejected).toBe(0);
    expect(index.get('igdb:igdb-remake-200')?.relationships).toHaveLength(1);
  });

  it('never-appearing original quarantines the edge without inventing a target', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    // A same-title decoy exists: the edge must NOT latch onto it.
    const decoy = makeOriginal();
    index.set('igdb:igdb-decoy-1', {
      ...decoy,
      id: createGameId('atp-igdb-igdb-decoy-1'),
      externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-decoy-1')],
    });

    const result = await runSync(gameRepository, [makeGroup(makeCandidate())], repository);

    // The remake itself is valid canonical data and persists.
    expect(result.totals.newGames).toBe(1);
    const remake = index.get('igdb:igdb-remake-200');
    expect(remake?.relationships).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0].reason).toContain('UNRESOLVED_RELATIONSHIP_TARGET');
    expect(records[0].reason).toContain('igdb-orig-100');
  });

  it('remake without a provider reference persists edgeless with no quarantine', async () => {
    const index = new Map<string, Game>([['igdb:igdb-orig-100', makeOriginal()]]);
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const candidate = makeCandidate({ parentGameId: null, versionParentId: null });
    const result = await runSync(gameRepository, [makeGroup(candidate)], repository);

    expect(result.totals.newGames).toBe(1);
    expect(index.get('igdb:igdb-remake-200')?.relationships).toHaveLength(0);
    expect(records).toHaveLength(0);
  });

  it('legacy edgeless remake re-ingested gets its edge attached (updated)', async () => {
    const legacy = createGame({
      id: createGameId('atp-igdb-igdb-remake-200'),
      titles: [createGameTitle('Remade Game', 'primary')],
      developers: [createOrganization('Test Dev')],
      publishers: [createOrganization('Test Pub')],
      genres: [createGenre('action')],
      externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-remake-200')],
      classification: 'GAME',
      completeness: 'FOUND_PARTIAL',
      gameType: 'remake',
      gameStatus: 'released',
    });
    const index = new Map<string, Game>([
      ['igdb:igdb-orig-100', makeOriginal()],
      ['igdb:igdb-remake-200', legacy],
    ]);
    const gameRepository = createMockGameRepository(index);

    const result = await runSync(gameRepository, [makeGroup(makeCandidate())]);

    expect(result.totals.updatedGames).toBe(1);
    expect(index.get('igdb:igdb-remake-200')?.relationships).toHaveLength(1);
  });

  it('single-ingest attaches the edge in one save when the original exists', async () => {
    const index = new Map<string, Game>([['igdb:igdb-orig-100', makeOriginal()]]);
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const group = makeGroup(makeCandidate());
    const service = new CatalogService({
      gameRepository,
      discoveryEngine: {
        discover: async (): Promise<DiscoveryResult> => ({
          query: 'Remade Game',
          groups: [group],
          totalGroups: 1,
          sourceErrors: [],
          hasMore: false,
        }),
      } as unknown as DiscoveryEngine,
      quarantineService: new QuarantineService({ quarantineRepository: repository }),
    });

    const result = await service.searchGames('Remade Game', { discover: true });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].relationships).toHaveLength(1);
    expect(result.data.items[0].relationships[0].type).toBe('REMAKE');
    expect(gameRepository.update).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });

  it('single-ingest with missing original saves the game and quarantines the edge', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const group = makeGroup(makeCandidate());
    const service = new CatalogService({
      gameRepository,
      discoveryEngine: {
        discover: async (): Promise<DiscoveryResult> => ({
          query: 'Remade Game',
          groups: [group],
          totalGroups: 1,
          sourceErrors: [],
          hasMore: false,
        }),
      } as unknown as DiscoveryEngine,
      quarantineService: new QuarantineService({ quarantineRepository: repository }),
    });

    const result = await service.searchGames('Remade Game', { discover: true });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].relationships).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0].reason).toContain('UNRESOLVED_RELATIONSHIP_TARGET');
  });
});
