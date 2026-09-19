import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import { QuarantineService } from '../../src/application/quarantine-service.js';
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
    titles: [{ value: 'Guarded Game', type: 'primary' }],
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
    externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-guarded-1')],
    provenance: {
      source: 'igdb',
      sourceId: 'igdb-guarded-1',
      retrievedAt: '2025-01-01T00:00:00Z',
      rawTitle: 'Guarded Game',
    },
    classificationHints: [],
    description: 'A Nintendo Switch game for guard testing',
    coverUrls: [],
    gameType: 'main_game',
    gameStatus: 'released',
    parentGameId: null,
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

function makeGroup(candidate: NormalizedCandidate, groupId = 'group-guard'): DiscoveryGroupResult {
  const observation: DiscoverySourceObservation = {
    source: 'igdb',
    sourceId: 'igdb-guarded-1',
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

function makeCanonical(overrides: Partial<Game> = {}): Game {
  return createGame({
    id: overrides.id ?? createGameId('atp-igdb-igdb-guarded-1'),
    titles: [createGameTitle('Guarded Game', 'primary')],
    developers: [createOrganization('Test Dev')],
    publishers: [createOrganization('Test Pub')],
    genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-guarded-1')],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
    gameType: 'main_game',
    gameStatus: 'released',
    ...overrides,
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
  dryRun = false,
) {
  const enrich = vi.fn(async (game: Game) => ({
    game,
    changes: [],
    conflicts: [],
    completeness: 'FOUND_PARTIAL' as const,
  }));
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
    enrichmentService: { enrich } as unknown as EnrichmentService,
    ...(quarantineRepository
      ? { quarantineService: new QuarantineService({ quarantineRepository }) }
      : {}),
  });
  return { promise: service.sync({
    platforms: ['nintendo-switch'],
    from: '2025-01-01',
    to: '2025-12-31',
    dryRun,
  }), enrich };
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

describe('reclassification guard (bulk sync)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('same gameType + same gameStatus continues normal ingestion', async () => {
    const stored = makeCanonical();
    const index = new Map<string, Game>([['igdb:igdb-guarded-1', stored]]);
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const { promise, enrich } = runSync(gameRepository, [makeGroup(makeCandidate())], repository);
    const result = await promise;

    expect(result.totals.existingGames).toBe(1);
    expect(result.totals.rejected).toBe(0);
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
  });

  it('stored nulls (legacy) + incoming known values proceed without conflict', async () => {
    const stored = makeCanonical({ gameType: null, gameStatus: null });
    const index = new Map<string, Game>([['igdb:igdb-guarded-1', stored]]);
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const { promise } = runSync(gameRepository, [makeGroup(makeCandidate())], repository);
    const result = await promise;

    expect(result.totals.existingGames).toBe(1);
    expect(result.totals.rejected).toBe(0);
    expect(records).toHaveLength(0);
    // No silent backfill: legacy nulls stay null (enrich writes no classification).
    expect(index.get('igdb:igdb-guarded-1')?.gameType).toBeNull();
  });

  it('stored known + incoming null preserves existing metadata', async () => {
    const stored = makeCanonical();
    const index = new Map<string, Game>([['igdb:igdb-guarded-1', stored]]);
    const gameRepository = createMockGameRepository(index);

    const candidate = makeCandidate({ gameType: null, gameStatus: null });
    const { promise } = runSync(gameRepository, [makeGroup(candidate)]);
    const result = await promise;

    expect(result.totals.existingGames).toBe(1);
    expect(result.totals.rejected).toBe(0);
    const after = index.get('igdb:igdb-guarded-1');
    expect(after?.gameType).toBe('main_game');
    expect(after?.gameStatus).toBe('released');
  });

  it('gameType change quarantines RECLASSIFICATION_CONFLICT without mutating', async () => {
    const stored = makeCanonical();
    const index = new Map<string, Game>([['igdb:igdb-guarded-1', stored]]);
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const candidate = makeCandidate({ gameType: 'remake', gameStatus: 'released' });
    const { promise, enrich } = runSync(gameRepository, [makeGroup(candidate)], repository);
    const result = await promise;

    expect(result.totals.rejected).toBe(1);
    expect(result.totals.newGames).toBe(0);
    expect(enrich).not.toHaveBeenCalled();
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(gameRepository.update).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0].reason).toContain('RECLASSIFICATION_CONFLICT');

    // Canonical record byte-identical: no duplicate, no mutation.
    const after = index.get('igdb:igdb-guarded-1');
    expect(after?.gameType).toBe('main_game');
    expect(after?.gameStatus).toBe('released');
    expect([...index.values()]).toHaveLength(1);
  });

  it('gameStatus change alone quarantines', async () => {
    const stored = makeCanonical();
    const index = new Map<string, Game>([['igdb:igdb-guarded-1', stored]]);
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const candidate = makeCandidate({ gameType: 'main_game', gameStatus: 'cancelled' });
    const { promise } = runSync(gameRepository, [makeGroup(candidate)], repository);
    const result = await promise;

    expect(result.totals.rejected).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0].reason).toContain('RECLASSIFICATION_CONFLICT');
    expect(index.get('igdb:igdb-guarded-1')?.gameStatus).toBe('released');
  });

  it('both changing quarantines and names both fields', async () => {
    const stored = makeCanonical();
    const index = new Map<string, Game>([['igdb:igdb-guarded-1', stored]]);
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const candidate = makeCandidate({ gameType: 'port', gameStatus: 'rumored' });
    const { promise } = runSync(gameRepository, [makeGroup(candidate)], repository);
    const result = await promise;

    expect(result.totals.rejected).toBe(1);
    expect(records[0].reason).toContain('gameType,gameStatus');
    expect([...index.values()]).toHaveLength(1);
  });

  it('port classification conflict cannot create a second canonical identity', async () => {
    const stored = makeCanonical();
    const index = new Map<string, Game>([['igdb:igdb-guarded-1', stored]]);
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    // Same provider identity resolves to the stored canonical game, but
    // the candidate now declares itself a port of something else.
    const candidate = makeCandidate({
      gameType: 'port',
      parentGameId: 'igdb-something-else',
    });
    const { promise } = runSync(gameRepository, [makeGroup(candidate)], repository);
    const result = await promise;

    expect(result.totals.rejected).toBe(1);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect([...index.values()]).toHaveLength(1);
    expect(records[0].reason).toContain('RECLASSIFICATION_CONFLICT');
  });

  it('port release folding leaves parent classification untouched', async () => {
    const parent = makeCanonical({
      id: createGameId('atp-igdb-igdb-parent-1'),
      externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-parent-1')],
    });
    const index = new Map<string, Game>([['igdb:igdb-parent-1', parent]]);
    const gameRepository = createMockGameRepository(index);

    const candidate = makeCandidate({
      gameType: 'port',
      gameStatus: 'released',
      parentGameId: 'igdb-parent-1',
      externalIdentifiers: [createExternalIdentifier('igdb', 'igdb-port-9')],
      provenance: {
        source: 'igdb',
        sourceId: 'igdb-port-9',
        retrievedAt: '2025-01-01T00:00:00Z',
        rawTitle: 'Guarded Game',
      },
    });
    const { promise } = runSync(gameRepository, [makeGroup(candidate, 'group-port')]);
    const result = await promise;

    expect(result.totals.updatedGames).toBe(1);
    const after = index.get('igdb:igdb-parent-1');
    expect(after?.releases).toHaveLength(1);
    expect(after?.gameType).toBe('main_game');
    expect(after?.gameStatus).toBe('released');
  });

  it('dry-run conflict reports rejected without quarantining', async () => {
    const stored = makeCanonical();
    const index = new Map<string, Game>([['igdb:igdb-guarded-1', stored]]);
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantineRepository();

    const candidate = makeCandidate({ gameType: 'remake', gameStatus: 'released' });
    const { promise } = runSync(gameRepository, [makeGroup(candidate)], repository, true);
    const result = await promise;

    expect(result.totals.rejected).toBe(1);
    expect(records).toHaveLength(0);
  });
});
