import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import { CatalogService } from '../../src/application/catalog-service.js';
import { QuarantineService } from '../../src/application/quarantine-service.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/shared/ids.js';
import { createGameId, createReleaseId } from '../../src/domain/shared/ids.js';
import { createGame } from '../../src/domain/game/game.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import type { Release } from '../../src/domain/game/release.js';
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
import type { EnrichmentService } from '../../src/application/enrichment-service.js';
import type { PlatformCatalogRepository } from '../../src/domain/platform/platform-catalog-repository.js';
import type { PlatformCatalogEntry } from '../../src/domain/platform/platform-catalog.js';

// ─── Builders ────────────────────────────────────────────────

function makeCandidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    titles: [{ value: 'Ported Game', type: 'primary' }],
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
    externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-port-9')],
    provenance: {
      source: 'igdb',
      sourceId: 'igdb-port-9',
      retrievedAt: '2025-01-01T00:00:00Z',
      rawTitle: 'Ported Game',
    },
    classificationHints: [],
    description: 'A Switch port for testing',
    coverUrls: [],
    gameType: 'port',
    gameStatus: null,
    parentGameId: 'igdb-parent-1',
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

function makeObservation(
  candidate: NormalizedCandidate,
  overrides: Partial<DiscoverySourceObservation> = {},
): DiscoverySourceObservation {
  return {
    source: 'igdb',
    sourceId: 'igdb-port-9',
    candidate,
    classification: gameClassification,
    retrievedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeGroup(candidate: NormalizedCandidate, groupId = 'group-port'): DiscoveryGroupResult {
  return {
    groupId,
    observations: [makeObservation(candidate)],
    mergedClassification: gameClassification,
    identityResolution: {
      confidence: 0.85,
      method: 'deterministic',
      matchedIdentifiers: [],
    },
    rankingScore: 0.8,
    rankingBreakdown: {
      identityConfidence: 0.85,
      classificationConfidence: 0.9,
      sourceCount: 1,
      observationCount: 1,
    },
  } as DiscoveryGroupResult;
}

function makeParentGame(overrides: Partial<Game> = {}): Game {
  const id = overrides.id ?? createGameId('atp-igdb-igdb-parent-1');
  return createGame({
    id,
    titles: [createGameTitle('Parent Game', 'primary')],
    developers: [createOrganization('Test Dev')],
    publishers: [createOrganization('Test Pub')],
    genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-parent-1')],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
    ...overrides,
  });
}

function makeRelease(gameId: GameId, platformName: string): Release {
  return {
    id: createReleaseId(`rel-${platformName}`),
    gameId,
    platform: { name: platformName, family: 'Nintendo', type: 'handheld' },
    region: null,
    releaseDate: null,
    version: null,
    edition: null,
    distributionChannels: [],
    launchers: [],
    externalIdentifiers: [],
    evidence: [],
  } as Release;
}

// ─── Mocks ───────────────────────────────────────────────────

function createMockGameRepository(index: Map<string, Game>): GameRepository {
  return {
    findById: vi.fn(async (id: GameId) => [...index.values()].find((g) => g.id === id) ?? null),
    findByExternalIdentifier: vi.fn(async ({ source, externalId }: { source: string; externalId: string }) => {
      const key = `${source}:${externalId}`;
      return index.get(key) ?? null;
    }),
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

function createMockPlatformCatalogRepository(): PlatformCatalogRepository {
  return {
    findById: vi.fn(async (id: string) =>
      id === switchPlatform.id ? { ...switchPlatform, gameCount: 0 } : null,
    ),
    findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
    findByCompany: vi.fn(async () => []),
    upsert: vi.fn(async () => {}),
  };
}

function createMockDiscoveryEngine(groups: DiscoveryGroupResult[]): DiscoveryEngine {
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

function runSync(
  gameRepository: GameRepository,
  groups: DiscoveryGroupResult[],
  quarantineRepository?: QuarantineRepository,
  dryRun = false,
) {
  const service = new CatalogSyncService({
    gameRepository,
    platformCatalogRepository: createMockPlatformCatalogRepository(),
    discoveryEngine: createMockDiscoveryEngine(groups),
    enrichmentService: {
      enrich: vi.fn(async (game: Game) => ({
        game,
        changes: [],
        conflicts: [],
        completeness: 'FOUND_PARTIAL',
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
    dryRun,
  });
}

// ─── Tests ───────────────────────────────────────────────────

describe('phase22 port ingestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('folds a port release into the canonical parent without creating a game', async () => {
    const parent = makeParentGame();
    const index = new Map<string, Game>([['igdb:igdb-parent-1', parent]]);
    const gameRepository = createMockGameRepository(index);

    const result = await runSync(gameRepository, [makeGroup(makeCandidate())]);

    expect(result.totals.updatedGames).toBe(1);
    expect(result.totals.newGames).toBe(0);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(gameRepository.update).toHaveBeenCalledTimes(1);

    const merged = index.get('igdb:igdb-parent-1');
    expect(merged?.releases).toHaveLength(1);
    expect(merged?.releases[0].platform.name).toBe('Nintendo Switch');
    // Parent identity untouched: no port titles, ids, or identifiers leak in.
    expect(merged?.titles.map((t) => t.value)).toEqual(['Parent Game']);
    expect(merged?.externalIdentifiers).toHaveLength(1);
  });

  it('prefers parent_game over version_parent when both exist', async () => {
    const parent = makeParentGame();
    const index = new Map<string, Game>([['igdb:igdb-parent-1', parent]]);
    const gameRepository = createMockGameRepository(index);

    const candidate = makeCandidate({ parentGameId: 'igdb-parent-1', versionParentId: 'igdb-v-2' });
    await runSync(gameRepository, [makeGroup(candidate)]);

    const queriedIds = vi
      .mocked(gameRepository.findByExternalIdentifier)
      .mock.calls.map(([arg]) => (arg as { externalId: string }).externalId);
    expect(queriedIds).toContain('igdb-parent-1');
    expect(queriedIds).not.toContain('igdb-v-2');
    expect(gameRepository.update).toHaveBeenCalledTimes(1);
  });

  it('resolves via version_parent when parent_game is absent (one hop)', async () => {
    const parent = makeParentGame({
      id: createGameId('atp-igdb-igdb-v-2'),
      externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-v-2')],
    });
    const index = new Map<string, Game>([['igdb:igdb-v-2', parent]]);
    const gameRepository = createMockGameRepository(index);

    const candidate = makeCandidate({ parentGameId: null, versionParentId: 'igdb-v-2' });
    const result = await runSync(gameRepository, [makeGroup(candidate)]);

    expect(result.totals.updatedGames).toBe(1);
    expect(gameRepository.save).not.toHaveBeenCalled();
  });

  it('reports existing (no write) when the port release is already attached', async () => {
    const parent = makeParentGame();
    (parent as { releases: Release[] }).releases = [makeRelease(parent.id, 'Nintendo Switch')];
    const index = new Map<string, Game>([['igdb:igdb-parent-1', parent]]);
    const gameRepository = createMockGameRepository(index);

    const result = await runSync(gameRepository, [makeGroup(makeCandidate())]);

    expect(result.totals.existingGames).toBe(1);
    expect(result.totals.updatedGames).toBe(0);
    expect(gameRepository.update).not.toHaveBeenCalled();
    expect(gameRepository.save).not.toHaveBeenCalled();
  });

  it('defers then quarantines UNRESOLVED_PORT_PARENT when the parent never appears', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const result = await runSync(gameRepository, [makeGroup(makeCandidate())], repository);

    expect(result.totals.rejected).toBe(1);
    expect(result.totals.newGames).toBe(0);
    expect(result.totals.errors).toBe(0);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(gameRepository.update).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0].reason).toContain('UNRESOLVED_PORT_PARENT');
  });

  it('resolves a deferred port in the second pass when the parent arrives later in the same run', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);

    // Port group first (parent missing), then the parent itself as canonical.
    // The parent passes the platform filter via description while carrying
    // only a PC release, so the port's Switch release still folds as new.
    const parentCandidate = makeCandidate({
      gameType: 'main_game',
      parentGameId: null,
      versionParentId: null,
      titles: [{ value: 'Parent Game', type: 'primary' }],
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
      externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-parent-1')],
      description: 'Parent game also released on Nintendo Switch',
      provenance: {
        source: 'igdb',
        sourceId: 'igdb-parent-1',
        retrievedAt: '2025-01-01T00:00:00Z',
        rawTitle: 'Parent Game',
      },
    });
    const groups = [makeGroup(makeCandidate(), 'group-port'), makeGroup(parentCandidate, 'group-parent')];

    const result = await runSync(gameRepository, groups);

    expect(result.totals.newGames).toBe(1);
    expect(result.totals.updatedGames).toBe(1);
    expect(gameRepository.save).toHaveBeenCalledTimes(1);
    const merged = index.get('igdb:igdb-parent-1');
    expect(merged?.releases).toHaveLength(1);
  });

  it('dry run reports the port disposition without writing', async () => {
    const parent = makeParentGame();
    const index = new Map<string, Game>([['igdb:igdb-parent-1', parent]]);
    const gameRepository = createMockGameRepository(index);

    const result = await runSync(gameRepository, [makeGroup(makeCandidate())], undefined, true);

    expect(result.totals.updatedGames).toBe(1);
    expect(gameRepository.update).not.toHaveBeenCalled();
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(index.get('igdb:igdb-parent-1')?.releases).toHaveLength(0);
  });

  it('rejects identifier-less groups on the bulk path (no atp-unknown fallback)', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const candidate = makeCandidate({
      gameType: 'main_game',
      parentGameId: null,
      externalIdentifiers: [],
    });
    const result = await runSync(gameRepository, [makeGroup(candidate)], repository);

    expect(result.totals.rejected).toBe(1);
    expect(result.totals.newGames).toBe(0);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0].reason).toContain('MISSING_STABLE_IDENTITY');
  });

  it('rejects identifier-less groups on the single-ingest path', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const candidate = makeCandidate({
      gameType: 'main_game',
      parentGameId: null,
      externalIdentifiers: [],
      releases: [],
      description: 'Identifier-less candidate',
    });
    const group = makeGroup(candidate);
    const discoveryEngine: DiscoveryEngine = {
      discover: vi.fn(async (): Promise<DiscoveryResult> => ({
        query: 'Ported Game',
        groups: [group],
        totalGroups: 1,
        sourceErrors: [],
        hasMore: false,
      })),
    } as unknown as DiscoveryEngine;

    const service = new CatalogService({
      gameRepository,
      discoveryEngine,
      quarantineService: new QuarantineService({ quarantineRepository: repository }),
    });

    const result = await service.searchGames('Ported Game', { discover: true });

    expect(result.data.items).toHaveLength(0);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0].reason).toContain('MISSING_STABLE_IDENTITY');
  });
});
