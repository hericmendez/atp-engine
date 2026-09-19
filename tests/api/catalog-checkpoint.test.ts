import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/shared/ids.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGame } from '../../src/domain/game/game.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import type { PlatformCatalogRepository } from '../../src/domain/platform/platform-catalog-repository.js';
import type { DiscoveryEngine, DiscoveryResult } from '../../src/discovery/discovery-engine.js';
import { EnrichmentService } from '../../src/application/enrichment-service.js';
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
import { QuarantineService } from '../../src/application/quarantine-service.js';
import type { QuarantineRepository } from '../../src/application/quarantine-repository.js';
import type { CatalogSource } from '../../src/sources/catalog-source.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';
import type {
  CatalogSyncState,
  CatalogSyncStateStatus,
} from '../../src/application/catalog-sync-state-types.js';
import type { CatalogSyncStateRepository } from '../../src/application/catalog-sync-state-repository.js';

// ─── Fakes ─────────────────────────────────────────────────────

function makeRaw(n: number): RawCandidate {
  const id = `ck-${n}`;
  return {
    source: 'igdb',
    sourceId: id,
    title: `Checkpoint Game ${n}`,
    platforms: ['PC'],
    developers: ['Test Dev'],
    publishers: ['Test Pub'],
    genres: ['action'],
    releaseDate: '2019-06-11',
    description: 'A checkpoint candidate game',
    coverUrls: [],
    externalIdentifiers: [{ source: 'igdb', id }],
    gameType: 'main_game',
    gameStatus: 'released',
    classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'test' }],
  };
}

function createFakeSource(total: number, failOffsets: Set<number> = new Set()) {
  const calls: number[] = [];
  const source: CatalogSource = {
    source: 'igdb',
    enumerateByPlatform: vi.fn(async (_platformId: number, opts: { limit: number; offset: number }) => {
      calls.push(opts.offset);
      if (failOffsets.has(opts.offset)) {
        throw new Error(`boom at offset ${opts.offset}`);
      }
      const size = Math.max(0, Math.min(opts.limit, total - opts.offset));
      return {
        items: Array.from({ length: size }, (_, i) => makeRaw(opts.offset + i)),
      };
    }),
    countByPlatform: vi.fn(async (_platformId: number) => total),
  };
  return { source, calls };
}

function createFakeGameRepository(index: Map<string, Game>): GameRepository {
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

function createFakeStateRepository(seed: CatalogSyncState[] = []) {
  const rows = new Map<string, CatalogSyncState>();
  for (const row of seed) {
    rows.set(`${row.source}|${row.scopeType}|${row.scopeId}`, { ...row });
  }
  const repository: CatalogSyncStateRepository = {
    upsert: vi.fn(async (state) => {
      const row: CatalogSyncState = {
        ...state,
        updatedAt: new Date().toISOString(),
      };
      rows.set(`${row.source}|${row.scopeType}|${row.scopeId}`, row);
      return row;
    }),
    findByScope: vi.fn(async (source: string, scopeType: string, scopeId: string) => {
      const row = rows.get(`${source}|${scopeType}|${scopeId}`);
      return row ? { ...row } : null;
    }),
    findBySource: vi.fn(async (source: string) =>
      [...rows.values()].filter((r) => r.source === source).map((r) => ({ ...r })),
    ),
  };
  return { repository, rows };
}

function createFakeQuarantine() {
  const records: unknown[] = [];
  const repository: QuarantineRepository = {
    record: vi.fn(async (entry) => {
      records.push(entry);
    }),
    findByGroupId: vi.fn(async () => null),
    count: vi.fn(async () => records.length),
  };
  return { repository, records };
}

function seedGames(index: Map<string, Game>, from: number, to: number): void {
  for (let n = from; n < to; n += 1) {
    const id = `ck-${n}`;
    const game = createGame({
      id: createGameId(`atp-igdb-${id}`),
      titles: [createGameTitle(`Checkpoint Game ${n}`, 'primary')],
      developers: [createOrganization('Test Dev')],
      publishers: [createOrganization('Test Pub')],
      genres: [createGenre('action')],
      externalIdentifiers: [createExternalIdentifier('igdb', id)],
      classification: 'GAME',
      completeness: 'FOUND_PARTIAL',
      gameType: 'main_game',
      gameStatus: 'released',
    });
    index.set(`igdb:${id}`, game);
  }
}

function makeRow(overrides: Partial<CatalogSyncState> = {}): CatalogSyncState {
  return {
    source: 'igdb',
    scopeType: 'platform',
    scopeId: '48',
    pageSize: 10,
    status: 'RUNNING' as CatalogSyncStateStatus,
    nextOffset: 0,
    totalCount: null,
    processed: 0,
    accepted: 0,
    quarantined: 0,
    errorCount: 0,
    startedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function createService(
  gameRepository: GameRepository,
  platformCatalogRepository: PlatformCatalogRepository,
) {
  return new CatalogSyncService({
    gameRepository,
    platformCatalogRepository,
    discoveryEngine: {
      discover: vi.fn(async (): Promise<DiscoveryResult> => ({
        query: '',
        groups: [],
        totalGroups: 0,
        sourceErrors: [],
        hasMore: false,
      })),
    } as unknown as DiscoveryEngine,
    enrichmentService: new EnrichmentService({ gameRepository }),
    classifier: new DeterministicClassifier(),
  });
}

function platformRepo(): PlatformCatalogRepository {
  return {
    findById: vi.fn(async () => null),
    findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
    findByCompany: vi.fn(async () => []),
    upsert: vi.fn(async () => {}),
  } as unknown as PlatformCatalogRepository;
}

// ─── Tests ─────────────────────────────────────────────────────

describe('ingestEnumerationResumable checkpoint/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A — first run starts at offset 0 and advances past the completed page', async () => {
    const { source } = createFakeSource(10);
    const games = new Map<string, Game>();
    const gameRepository = createFakeGameRepository(games);
    const { repository: states } = createFakeStateRepository();
    const service = createService(gameRepository, platformRepo());

    const result = await service.ingestEnumerationResumable(source, 48, { pageSize: 10 }, states);

    expect(result.status).toBe('COMPLETED');
    expect(result.pages).toBe(1);
    expect(result.nextOffset).toBe(10);
    expect(result.processed).toBe(10);
    expect(result.accepted).toBe(10);
    expect(games.size).toBe(10);
    const row = await states.findByScope('igdb', 'platform', '48');
    expect(row?.status).toBe('COMPLETED');
    expect(row?.nextOffset).toBe(10);
    expect(row?.pageSize).toBe(10);
    expect(row?.completedAt).toBeDefined();
    expect(row?.error).toBeUndefined();
  });

  it('B — resume starts at the checkpoint offset and accumulates counters', async () => {
    const { source, calls } = createFakeSource(25);
    const games = new Map<string, Game>();
    seedGames(games, 0, 10);
    const gameRepository = createFakeGameRepository(games);
    const { repository: states } = createFakeStateRepository([
      makeRow({ nextOffset: 10, totalCount: 25, processed: 10, accepted: 10 }),
    ]);
    const service = createService(gameRepository, platformRepo());

    const result = await service.ingestEnumerationResumable(source, 48, { pageSize: 10 }, states);

    expect(calls).toEqual([10, 20]);
    expect(result.status).toBe('COMPLETED');
    expect(result.nextOffset).toBe(30);
    expect(result.processed).toBe(25);
    expect(result.accepted).toBe(25);
    expect(games.size).toBe(25);
  });

  it('C — page failure keeps the checkpoint on the failed page', async () => {
    const { source } = createFakeSource(25, new Set([10]));
    const games = new Map<string, Game>();
    const gameRepository = createFakeGameRepository(games);
    const { repository: states } = createFakeStateRepository();
    const service = createService(gameRepository, platformRepo());

    await expect(
      service.ingestEnumerationResumable(source, 48, { pageSize: 10 }, states),
    ).rejects.toThrow('boom at offset 10');

    expect(games.size).toBe(10);
    const row = await states.findByScope('igdb', 'platform', '48');
    expect(row?.status).toBe('FAILED');
    expect(row?.nextOffset).toBe(10);
    expect(row?.error).toContain('boom at offset 10');
  });

  it('D — crash after writes but before checkpoint reprocesses safely', async () => {
    const { source } = createFakeSource(10);
    const games = new Map<string, Game>();
    const gameRepository = createFakeGameRepository(games);
    let failUpserts = true;
    const { repository: states } = createFakeStateRepository();
    const upsert = states.upsert;
    states.upsert = vi.fn(async (state) => {
      if (failUpserts) {
        throw new Error('checkpoint store down');
      }
      return upsert(state);
    });
    const service = createService(gameRepository, platformRepo());

    // First run: page writes land, checkpoint advance fails.
    await expect(
      service.ingestEnumerationResumable(source, 48, { pageSize: 10 }, states),
    ).rejects.toThrow('checkpoint store down');
    expect(games.size).toBe(10);
    expect(await states.findByScope('igdb', 'platform', '48')).toBeNull();

    // Second run: same page reprocessed, zero duplicates, zero updates.
    failUpserts = false;
    const savesBefore = vi.mocked(gameRepository.save).mock.calls.length;
    const result = await service.ingestEnumerationResumable(source, 48, { pageSize: 10 }, states);

    expect(result.status).toBe('COMPLETED');
    expect(result.nextOffset).toBe(10);
    expect(games.size).toBe(10);
    expect(vi.mocked(gameRepository.save).mock.calls.length).toBe(savesBefore);
    expect(gameRepository.update).not.toHaveBeenCalled();
  });

  it('E — last partial page completes the scope', async () => {
    const { source, calls } = createFakeSource(25);
    const games = new Map<string, Game>();
    const gameRepository = createFakeGameRepository(games);
    const { repository: states } = createFakeStateRepository();
    const service = createService(gameRepository, platformRepo());

    const result = await service.ingestEnumerationResumable(source, 48, { pageSize: 10 }, states);

    expect(calls).toEqual([0, 10, 20]);
    expect(result.status).toBe('COMPLETED');
    expect(result.nextOffset).toBe(30);
    expect(result.processed).toBe(25);
    expect(games.size).toBe(25);
    const row = await states.findByScope('igdb', 'platform', '48');
    expect(row?.status).toBe('COMPLETED');
  });

  it('F — dry-run never touches the checkpoint store', async () => {
    const { source } = createFakeSource(25);
    const games = new Map<string, Game>();
    const gameRepository = createFakeGameRepository(games);
    const { repository: quarantineRepository, records } = createFakeQuarantine();
    const before = makeRow({ nextOffset: 10, processed: 10, accepted: 10 });
    const { repository: states } = createFakeStateRepository([before]);
    const service = new CatalogSyncService({
      gameRepository,
      platformCatalogRepository: platformRepo(),
      discoveryEngine: {
        discover: vi.fn(async (): Promise<DiscoveryResult> => ({
          query: '',
          groups: [],
          totalGroups: 0,
          sourceErrors: [],
          hasMore: false,
        })),
      } as unknown as DiscoveryEngine,
      enrichmentService: new EnrichmentService({ gameRepository }),
      quarantineService: new QuarantineService({ quarantineRepository }),
      classifier: new DeterministicClassifier(),
    });

    const result = await service.ingestEnumerationResumable(
      source,
      48,
      { pageSize: 10, dryRun: true },
      states,
    );

    expect(result.dryRun).toBe(true);
    expect(result.pages).toBe(2);
    expect(await states.findByScope('igdb', 'platform', '48')).toEqual(before);
    expect(games.size).toBe(0);
    expect(records).toHaveLength(0);
  });

  it('G — resuming with a different pageSize is an explicit error', async () => {
    const { source } = createFakeSource(250);
    const games = new Map<string, Game>();
    const gameRepository = createFakeGameRepository(games);
    const before = makeRow({ nextOffset: 100, pageSize: 100, processed: 100, accepted: 100 });
    const { repository: states } = createFakeStateRepository([before]);
    const service = createService(gameRepository, platformRepo());

    await expect(
      service.ingestEnumerationResumable(source, 48, { pageSize: 500 }, states),
    ).rejects.toThrow('pageSize mismatch');

    expect(await states.findByScope('igdb', 'platform', '48')).toEqual(before);
    expect(source.countByPlatform).not.toHaveBeenCalled();
    expect(games.size).toBe(0);
  });

  it('H — checkpoints never leak across platforms or sources', async () => {
    const { source } = createFakeSource(10);
    const games = new Map<string, Game>();
    const gameRepository = createFakeGameRepository(games);
    const otherPlatform = makeRow({ scopeId: '49', nextOffset: 40, processed: 40, accepted: 40 });
    const otherSource = makeRow({ source: 'steam', nextOffset: 70, processed: 70, accepted: 70 });
    const { repository: states } = createFakeStateRepository([otherPlatform, otherSource]);
    const service = createService(gameRepository, platformRepo());

    const result = await service.ingestEnumerationResumable(source, 48, { pageSize: 10 }, states);

    expect(result.nextOffset).toBe(10);
    expect(await states.findByScope('igdb', 'platform', '49')).toEqual(otherPlatform);
    expect(await states.findByScope('steam', 'platform', '48')).toEqual(otherSource);
    const own = await states.findByScope('igdb', 'platform', '48');
    expect(own?.status).toBe('COMPLETED');
  });

  it('rerunning a COMPLETED scope is a no-op', async () => {
    const { source } = createFakeSource(10);
    const games = new Map<string, Game>();
    const gameRepository = createFakeGameRepository(games);
    const done = makeRow({
      status: 'COMPLETED',
      nextOffset: 10,
      totalCount: 10,
      processed: 10,
      accepted: 10,
    });
    const { repository: states } = createFakeStateRepository([done]);
    const service = createService(gameRepository, platformRepo());

    const result = await service.ingestEnumerationResumable(source, 48, { pageSize: 10 }, states);

    expect(result.status).toBe('COMPLETED');
    expect(result.pages).toBe(0);
    expect(source.countByPlatform).not.toHaveBeenCalled();
    expect(games.size).toBe(0);
    expect(await states.findByScope('igdb', 'platform', '48')).toEqual(done);
  });
});
