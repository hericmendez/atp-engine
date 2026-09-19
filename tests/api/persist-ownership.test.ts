import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import { QuarantineService } from '../../src/application/quarantine-service.js';
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
import { EnrichmentService } from '../../src/application/enrichment-service.js';
import { logger } from '../../src/infrastructure/logger/logger.js';
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
} from '../../src/discovery/discovery-types.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';
import type { CatalogSource } from '../../src/sources/catalog-source.js';
import type { QuarantineRepository } from '../../src/application/quarantine-repository.js';
import type { PlatformCatalogRepository } from '../../src/domain/platform/platform-catalog-repository.js';

// ─── Builders ────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    source: 'igdb',
    sourceId: 'igdb-100',
    title: 'Owned Game',
    platforms: ['PC'],
    developers: ['Test Dev'],
    publishers: ['Test Pub'],
    genres: ['action'],
    releaseDate: '2014-02-25',
    description: 'An owned game',
    coverUrls: [],
    externalIdentifiers: [{ source: 'igdb', id: 'igdb-100' }],
    gameType: 'main_game',
    gameStatus: null,
    parentGameId: undefined,
    versionParentId: undefined,
    classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'test' }],
    ...overrides,
  };
}

function makeStoredGame(id: string, extId: string): Game {
  return createGame({
    id: createGameId(id),
    titles: [createGameTitle('Stored Game', 'primary')],
    developers: [createOrganization('Test Dev')],
    publishers: [createOrganization('Test Pub')],
    genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('igdb', extId)],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
    gameType: 'main_game',
    gameStatus: null,
  });
}

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
        if (index.has(`${ext.source}:${ext.id}`)) {
          throw new Error(`duplicate key: ${ext.source}:${ext.id}`);
        }
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

function createMockSource(items: RawCandidate[]): CatalogSource {
  return {
    source: 'igdb',
    enumerateByPlatform: vi.fn(async () => ({ items })),
    countByPlatform: vi.fn(async () => items.length),
  };
}

function createMockQuarantine() {
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

function createService(
  gameRepository: GameRepository,
  quarantineRepository?: QuarantineRepository,
  enrichmentService?: EnrichmentService,
) {
  return new CatalogSyncService({
    gameRepository,
    platformCatalogRepository: {
      findById: vi.fn(async () => null),
      findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
      findByCompany: vi.fn(async () => []),
      upsert: vi.fn(async () => {}),
    } as unknown as PlatformCatalogRepository,
    discoveryEngine: {
      discover: vi.fn(async (): Promise<DiscoveryResult> => ({
        query: '',
        groups: [],
        totalGroups: 0,
        sourceErrors: [],
        hasMore: false,
      })),
    } as unknown as DiscoveryEngine,
    enrichmentService:
      enrichmentService ?? new EnrichmentService({ gameRepository }),
    classifier: new DeterministicClassifier(),
    ...(quarantineRepository
      ? { quarantineService: new QuarantineService({ quarantineRepository }) }
      : {}),
  });
}

// ─── Tests ───────────────────────────────────────────────────

describe('persistence ownership (single-write final state)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('A — enrichment without edge persists once with enriched data', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const service = createService(gameRepository);
    const source = createMockSource([makeRaw()]);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.newGames).toBe(1);
    expect(gameRepository.save).toHaveBeenCalledTimes(1);
    expect(gameRepository.update).not.toHaveBeenCalled();
    const stored = index.get('igdb:igdb-100');
    // Enriched releases preserved (single save carried them).
    expect(stored?.releases.map((r) => r.platform.name)).toEqual(['PC']);
  });

  it('B — enrichment + relationship persists once with both releases and edge', async () => {
    const parent = makeStoredGame('atp-igdb-igdb-orig-1', 'igdb-orig-1');
    const index = new Map<string, Game>([['igdb:igdb-orig-1', parent]]);
    const gameRepository = createMockGameRepository(index);
    const service = createService(gameRepository);
    const source = createMockSource([
      makeRaw({
        gameType: 'remake',
        sourceId: 'igdb-200',
        title: 'Remade Game',
        externalIdentifiers: [{ source: 'igdb', id: 'igdb-200' }],
        parentGameId: 'igdb-orig-1',
      }),
    ]);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.newGames).toBe(1);
    // Exactly one write total — no stale second write exists anymore.
    expect(gameRepository.save).toHaveBeenCalledTimes(1);
    expect(gameRepository.update).not.toHaveBeenCalled();
    const stored = index.get('igdb:igdb-200');
    expect(stored?.releases.map((r) => r.platform.name)).toEqual(['PC']);
    expect(stored?.relationships).toHaveLength(1);
    expect(stored?.relationships[0]).toMatchObject({ type: 'REMAKE' });
  });

  it('C — re-ingesting an unchanged game writes nothing', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const service = createService(gameRepository);
    const source = createMockSource([makeRaw()]);

    await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });
    expect(gameRepository.save).toHaveBeenCalledTimes(1);
    vi.mocked(gameRepository.save).mockClear();
    vi.mocked(gameRepository.update).mockClear();

    const second = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(second.existingGames).toBe(1);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(gameRepository.update).not.toHaveBeenCalled();
  });

  it('D — save failure is captured with operation context and others continue', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    vi.mocked(gameRepository.save).mockRejectedValueOnce(new Error('duplicate key: boom'));
    const service = createService(gameRepository);
    const source = createMockSource([
      makeRaw(),
      makeRaw({
        sourceId: 'igdb-101',
        title: 'Second Game',
        externalIdentifiers: [{ source: 'igdb', id: 'igdb-101' }],
      }),
    ]);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.errors).toBe(1);
    expect(result.newGames).toBe(1);
    expect(index.get('igdb:igdb-101')).toBeDefined();
    const persistLog = warnSpy.mock.calls.find(
      ([event]) => event === 'catalog.persist.failed',
    );
    expect(persistLog).toBeDefined();
    expect(persistLog?.[1]).toMatchObject({ operation: 'save-new' });
    expect(persistLog?.[1]).toHaveProperty('gameId');
    expect(persistLog?.[1]).toHaveProperty('groupId');
  });

  it('E — enrich compute failure persists nothing (pipeline-level atomicity)', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const failingEnrichment = {
      enrich: vi.fn(async () => {
        throw new Error('enrich compute exploded');
      }),
    } as unknown as EnrichmentService;
    const service = createService(gameRepository, undefined, failingEnrichment);
    const source = createMockSource([makeRaw()]);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    // Enrichment now runs in memory before the single save: a compute
    // failure persists nothing (no partial game), counts the error, and
    // nothing is retried. This atomicity is the documented real behavior.
    expect(result.errors).toBe(1);
    expect(result.newGames).toBe(0);
    expect(index.size).toBe(0);
    expect(gameRepository.save).not.toHaveBeenCalled();
  });

  it('F — existing game with changes and a new edge persists once with both', async () => {
    const parent = makeStoredGame('atp-igdb-igdb-orig-1', 'igdb-orig-1');
    const legacy = makeStoredGame('atp-igdb-igdb-200', 'igdb-200');
    const index = new Map<string, Game>([
      ['igdb:igdb-orig-1', parent],
      ['igdb:igdb-200', { ...legacy, gameType: 'remake' }],
    ]);
    const gameRepository = createMockGameRepository(index);
    const service = createService(gameRepository);
    const source = createMockSource([
      makeRaw({
        gameType: 'remake',
        sourceId: 'igdb-200',
        title: 'Remade Game',
        externalIdentifiers: [{ source: 'igdb', id: 'igdb-200' }],
        parentGameId: 'igdb-orig-1',
      }),
    ]);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.updatedGames).toBe(1);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(gameRepository.update).toHaveBeenCalledTimes(1);
    const stored = index.get('igdb:igdb-200');
    expect(stored?.releases.map((r) => r.platform.name)).toEqual(['PC']);
    expect(stored?.relationships).toHaveLength(1);
  });
});
