import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import { QuarantineService } from '../../src/application/quarantine-service.js';
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
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
import type { DiscoveryResult } from '../../src/discovery/discovery-types.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';
import type { CatalogSource } from '../../src/sources/catalog-source.js';
import type { QuarantineRepository } from '../../src/application/quarantine-repository.js';
import type { PlatformCatalogRepository } from '../../src/domain/platform/platform-catalog-repository.js';
import type { EnrichmentService } from '../../src/application/enrichment-service.js';

// ─── Builders ────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    source: 'igdb',
    sourceId: 'igdb-100',
    title: 'Enumerated Game',
    platforms: ['PC'],
    developers: ['Test Dev'],
    publishers: ['Test Pub'],
    genres: ['action'],
    releaseDate: '2014-02-25',
    description: 'An enumerated game',
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
  source: CatalogSource,
  quarantineRepository?: QuarantineRepository,
  withClassifier = true,
) {
  const service = new CatalogSyncService({
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
    enrichmentService: {
      enrich: vi.fn(async (game: Game) => ({
        game,
        changes: [],
        conflicts: [],
        completeness: 'FOUND_PARTIAL' as const,
      })),
    } as unknown as EnrichmentService,
    ...(withClassifier ? { classifier: new DeterministicClassifier() } : {}),
    ...(quarantineRepository
      ? { quarantineService: new QuarantineService({ quarantineRepository }) }
      : {}),
  });
  return { service, source };
}

// ─── Tests ───────────────────────────────────────────────────

describe('ingestEnumerationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects excluded types before persistence even with valid identity', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantine();
    const source = createMockSource([makeRaw({ gameType: 'dlc_addon', sourceId: 'igdb-200', externalIdentifiers: [{ source: 'igdb', id: 'igdb-200' }] })]);
    const { service } = createService(gameRepository, source, repository);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.candidatesFound).toBe(1);
    expect(result.newGames).toBe(0);
    expect(result.rejected).toBe(1);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(records).toHaveLength(1);
    expect(records[0].reason).toContain('POLICY_EXCLUDED');
    expect(records[0].reason).toContain('dlc_addon');
  });

  it('persists main_game with absent status and past release evidence', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const source = createMockSource([makeRaw()]);
    const { service } = createService(gameRepository, source);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.newGames).toBe(1);
    expect(result.rejected).toBe(0);
    expect(gameRepository.save).toHaveBeenCalledTimes(1);
    const saved = index.get('igdb:igdb-100');
    expect(saved?.id).toBe('atp-igdb-igdb-100');
    // Status itself is never rewritten.
    expect(saved?.gameStatus).toBeNull();
  });

  it('sends main_game without release evidence to review, not to save', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantine();
    const raw = makeRaw({ releaseDate: undefined });
    delete (raw as { releases?: unknown }).releases;
    const source = createMockSource([raw]);
    const { service } = createService(gameRepository, source, repository);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.newGames).toBe(0);
    expect(result.rejected).toBe(1);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(records[0].reason).toContain('POLICY_REVIEW');
  });

  it('still enforces the stable-identity ban after a CANONICAL policy decision', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantine();
    const source = createMockSource([makeRaw({ externalIdentifiers: [] })]);
    const { service } = createService(gameRepository, source, repository);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.newGames).toBe(0);
    expect(result.rejected).toBe(1);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(records[0].reason).toContain('MISSING_STABLE_IDENTITY');
  });

  it('folds ports with resolvable parents instead of persisting', async () => {
    const parent = makeStoredGame('atp-igdb-igdb-parent-1', 'igdb-parent-1');
    const index = new Map<string, Game>([['igdb:igdb-parent-1', parent]]);
    const gameRepository = createMockGameRepository(index);
    const source = createMockSource([
      makeRaw({
        gameType: 'port',
        sourceId: 'igdb-port-9',
        externalIdentifiers: [{ source: 'igdb', id: 'igdb-port-9' }],
        parentGameId: 'igdb-parent-1',
        platforms: ['Nintendo Switch'],
      }),
    ]);
    const { service } = createService(gameRepository, source);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.updatedGames).toBe(1);
    expect(result.newGames).toBe(0);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(index.get('igdb:igdb-parent-1')?.releases).toHaveLength(1);
  });

  it('quarantines ports without any parent reference immediately', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantine();
    const source = createMockSource([
      makeRaw({ gameType: 'port', parentGameId: undefined, versionParentId: undefined }),
    ]);
    const { service } = createService(gameRepository, source, repository);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.rejected).toBe(1);
    expect(result.newGames).toBe(0);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(records[0].reason).toContain('UNRESOLVED_PORT_PARENT');
  });

  it('dry-run reports dispositions without writing anything', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantine();
    const source = createMockSource([
      makeRaw(),
      makeRaw({ gameType: 'bundle', sourceId: 'igdb-300', externalIdentifiers: [{ source: 'igdb', id: 'igdb-300' }] }),
    ]);
    const { service } = createService(gameRepository, source, repository);

    const result = await service.ingestEnumerationPage(source, 48, {
      limit: 10,
      offset: 0,
      dryRun: true,
    });

    expect(result.newGames).toBe(1);
    expect(result.rejected).toBe(1);
    expect(gameRepository.save).not.toHaveBeenCalled();
    expect(gameRepository.update).not.toHaveBeenCalled();
    expect(repository.record).not.toHaveBeenCalled();
    expect(records).toHaveLength(0);
    expect(index.size).toBe(0);
  });

  it('persists delisted main_game and quarantines cancelled regardless of evidence', async () => {
    const index = new Map<string, Game>();
    const gameRepository = createMockGameRepository(index);
    const { records, repository } = createMockQuarantine();
    const source = createMockSource([
      makeRaw({ gameStatus: 'delisted', sourceId: 'igdb-400', externalIdentifiers: [{ source: 'igdb', id: 'igdb-400' }] }),
      makeRaw({ gameStatus: 'cancelled', sourceId: 'igdb-500', externalIdentifiers: [{ source: 'igdb', id: 'igdb-500' }] }),
    ]);
    const { service } = createService(gameRepository, source, repository);

    const result = await service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 });

    expect(result.newGames).toBe(1);
    expect(result.rejected).toBe(1);
    expect(index.get('igdb:igdb-400')?.gameStatus).toBe('delisted');
    expect(records[0].reason).toContain('POLICY_EXCLUDED');
  });

  it('requires a configured classifier', async () => {
    const gameRepository = createMockGameRepository(new Map());
    const source = createMockSource([makeRaw()]);
    const { service } = createService(gameRepository, source, undefined, false);

    await expect(service.ingestEnumerationPage(source, 48, { limit: 10, offset: 0 })).rejects.toThrow(
      'requires a configured classifier',
    );
  });
});
