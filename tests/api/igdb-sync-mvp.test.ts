import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/shared/ids.js';
import { EnrichmentService } from '../../src/application/enrichment-service.js';
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
import { QuarantineService } from '../../src/application/quarantine-service.js';
import type { QuarantineRepository } from '../../src/application/quarantine-repository.js';
import type { PlatformCatalogRepository } from '../../src/domain/platform/platform-catalog-repository.js';
import type { DiscoveryEngine, DiscoveryResult } from '../../src/discovery/discovery-engine.js';
import type { CatalogSource } from '../../src/sources/catalog-source.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';
import type { CatalogSyncStateRepository } from '../../src/application/catalog-sync-state-repository.js';
import type { CatalogSyncState } from '../../src/application/catalog-sync-state-types.js';
import { parseSyncArgs, formatSyncReport } from '../../src/scripts/sync-igdb.js';

// ─── Fakes (same seams as tests/api/catalog-checkpoint.test.ts) ───

interface RawOverrides {
  gameType?: string;
  externalIdentifiers?: { source: string; id: string }[];
}

function makeRaw(n: number, overrides: RawOverrides = {}): RawCandidate {
  const id = `mvp-${n}`;
  return {
    source: 'igdb',
    sourceId: id,
    title: `MVP Game ${n}`,
    platforms: ['PC'],
    developers: ['Test Dev'],
    publishers: ['Test Pub'],
    genres: ['action'],
    releaseDate: '2020-01-15',
    description: 'An MVP candidate game',
    coverUrls: [],
    externalIdentifiers: overrides.externalIdentifiers ?? [{ source: 'igdb', id }],
    gameType: overrides.gameType ?? 'main_game',
    gameStatus: 'released',
    classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'test' }],
  };
}

function createFakeSource(
  total: number,
  makeItem: (n: number) => RawCandidate = (n) => makeRaw(n),
) {
  const calls: { limit: number; offset: number }[] = [];
  const source: CatalogSource = {
    source: 'igdb',
    enumerateByPlatform: vi.fn(
      async (_platformId: number, opts: { limit: number; offset: number }) => {
        calls.push({ ...opts });
        const size = Math.max(0, Math.min(opts.limit, total - opts.offset));
        return {
          items: Array.from({ length: size }, (_, i) => makeItem(opts.offset + i)),
        };
      },
    ),
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

function createFakeStateRepository() {
  const rows = new Map<string, CatalogSyncState>();
  const repository: CatalogSyncStateRepository = {
    upsert: vi.fn(async (state) => {
      const row = { ...state, updatedAt: new Date().toISOString() } as CatalogSyncState;
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

function createService(gameRepository: GameRepository) {
  const quarantineRepository: QuarantineRepository = {
    record: vi.fn(async () => {}),
    findByGroupId: vi.fn(async () => null),
    count: vi.fn(async () => 0),
  };
  return new CatalogSyncService({
    gameRepository,
    platformCatalogRepository: {} as PlatformCatalogRepository,
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
}

// ─── Tests ───────────────────────────────────────────────────────

describe('IGDB sync MVP: limit / resume / policy gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('limit stops early with LIMIT_REACHED and an exact RUNNING checkpoint', async () => {
    const { source, calls } = createFakeSource(25);
    const games = new Map<string, Game>();
    const service = createService(createFakeGameRepository(games));
    const { repository: states, rows } = createFakeStateRepository();

    const result = await service.ingestEnumerationResumable(
      source,
      48,
      { pageSize: 10, limit: 15 },
      states,
    );

    expect(result.status).toBe('LIMIT_REACHED');
    expect(result.pages).toBe(2);
    expect(result.processed).toBe(15);
    expect(result.nextOffset).toBe(15);
    expect(calls).toEqual([
      { limit: 10, offset: 0 },
      { limit: 5, offset: 10 },
    ]);
    const row = rows.get('igdb|platform|48');
    expect(row?.status).toBe('RUNNING');
    expect(row?.nextOffset).toBe(15);
    expect(games.size).toBe(15);
  });

  it('a later run resumes from the checkpoint and completes without duplicates', async () => {
    const { source } = createFakeSource(25);
    const games = new Map<string, Game>();
    const service = createService(createFakeGameRepository(games));
    const { repository: states, rows } = createFakeStateRepository();

    await service.ingestEnumerationResumable(source, 48, { pageSize: 10, limit: 15 }, states);
    const second = await service.ingestEnumerationResumable(source, 48, { pageSize: 10 }, states);

    expect(second.status).toBe('COMPLETED');
    expect(second.processed).toBe(25);
    expect(second.nextOffset).toBe(25);
    expect(games.size).toBe(25);
    expect(rows.get('igdb|platform|48')?.status).toBe('COMPLETED');
  });

  it('rerunning the same limited scope creates nothing new (idempotent)', async () => {
    const { source } = createFakeSource(10);
    const games = new Map<string, Game>();
    const service = createService(createFakeGameRepository(games));
    const { repository: states } = createFakeStateRepository();

    const first = await service.ingestEnumerationResumable(
      source,
      48,
      { pageSize: 10, limit: 10 },
      states,
    );
    const sizeAfterFirst = games.size;
    const second = await service.ingestEnumerationResumable(
      source,
      48,
      { pageSize: 10, limit: 10 },
      states,
    );

    expect(first.processed).toBe(10);
    expect(games.size).toBe(sizeAfterFirst);
    expect(second.processed).toBe(10);
    expect(games.size).toBe(sizeAfterFirst);
    for (const game of games.values()) {
      expect(game.id.startsWith('atp-unknown-')).toBe(false);
    }
  });

  it('rejects invalid limit and delayMs values', async () => {
    const { source } = createFakeSource(10);
    const games = new Map<string, Game>();
    const service = createService(createFakeGameRepository(games));
    const { repository: states } = createFakeStateRepository();

    await expect(
      service.ingestEnumerationResumable(source, 48, { pageSize: 10, limit: 0 }, states),
    ).rejects.toThrow('limit must be a positive integer');
    await expect(
      service.ingestEnumerationResumable(source, 48, { pageSize: 10, delayMs: -1 }, states),
    ).rejects.toThrow('delayMs must be a non-negative integer');
    expect(games.size).toBe(0);
  });

  it('dry-run with limit touches neither the catalog nor the checkpoint store', async () => {
    const { source } = createFakeSource(25);
    const games = new Map<string, Game>();
    const service = createService(createFakeGameRepository(games));
    const { repository: states, rows } = createFakeStateRepository();

    const result = await service.ingestEnumerationResumable(
      source,
      48,
      { pageSize: 10, limit: 15, dryRun: true },
      states,
    );

    expect(result.status).toBe('LIMIT_REACHED');
    expect(result.dryRun).toBe(true);
    expect(games.size).toBe(0);
    expect(rows.size).toBe(0);
  });

  it('unsupported game types are quarantined, never persisted', async () => {
    const { source } = createFakeSource(5, (n) => makeRaw(n, { gameType: 'dlc_addon' }));
    const games = new Map<string, Game>();
    const service = createService(createFakeGameRepository(games));
    const { repository: states } = createFakeStateRepository();

    const result = await service.ingestEnumerationResumable(source, 48, { pageSize: 5 }, states);

    expect(result.status).toBe('COMPLETED');
    expect(result.quarantined).toBe(5);
    expect(result.accepted).toBe(0);
    expect(games.size).toBe(0);
  });

  it('candidates without a stable external identity are rejected, never atp-unknown-*', async () => {
    const { source } = createFakeSource(3, (n) => makeRaw(n, { externalIdentifiers: [] }));
    const games = new Map<string, Game>();
    const service = createService(createFakeGameRepository(games));
    const { repository: states } = createFakeStateRepository();

    const result = await service.ingestEnumerationResumable(source, 48, { pageSize: 3 }, states);

    expect(result.quarantined).toBe(3);
    expect(games.size).toBe(0);
  });
});

describe('sync:igdb CLI arg parsing and report', () => {
  it('parses full flags and applies defaults', () => {
    expect(parseSyncArgs(['--platform-id', '6'])).toEqual({
      mode: 'single',
      platformId: 6,
      pageSize: 100,
      limit: undefined,
      initialOffset: undefined,
      dryRun: false,
      delayMs: 300,
    });
    expect(
      parseSyncArgs([
        '--platform-id',
        '48',
        '--page-size',
        '50',
        '--limit',
        '10',
        '--dry-run',
        '--delay-ms',
        '0',
      ]),
    ).toEqual({
      mode: 'single',
      platformId: 48,
      pageSize: 50,
      limit: 10,
      initialOffset: undefined,
      dryRun: true,
      delayMs: 0,
    });
    expect(parseSyncArgs(['--platform', 'Windows'])).toMatchObject({
      mode: 'single',
      curatedName: 'Windows',
    });
    expect(parseSyncArgs(['--all'])).toMatchObject({ mode: 'all' });
    expect(parseSyncArgs(['--validate-platforms'])).toMatchObject({
      mode: 'validate',
      dryRun: true,
    });
  });

  it('rejects missing or invalid flags', () => {
    expect(() => parseSyncArgs([])).toThrow('exactly one of');
    expect(() => parseSyncArgs(['--platform-id', '0'])).toThrow('--platform-id');
    expect(() => parseSyncArgs(['--platform-id', '6', '--page-size', '501'])).toThrow(
      '--page-size',
    );
    expect(() => parseSyncArgs(['--platform-id', '6', '--limit', '0'])).toThrow('--limit');
    expect(() => parseSyncArgs(['--platform-id', '6', '--delay-ms', '-5'])).toThrow('--delay-ms');
    expect(() => parseSyncArgs(['--platform-id', '6', '--offset', '-1'])).toThrow('--offset');
    expect(() => parseSyncArgs(['--all', '--platform-id', '6'])).toThrow('exactly one of');
    expect(() => parseSyncArgs(['--validate-platforms', '--limit', '10'])).toThrow(
      'no --offset/--limit',
    );
  });

  it('formats the final report with counts and status', () => {
    const report = formatSyncReport(
      {
        status: 'LIMIT_REACHED',
        source: 'igdb',
        platformId: 6,
        pageSize: 10,
        totalCount: 250,
        nextOffset: 10,
        processed: 10,
        accepted: 8,
        quarantined: 2,
        errorCount: 0,
        newGames: 6,
        existingGames: 1,
        updatedGames: 1,
        pages: 1,
        dryRun: true,
        durationMs: 1500,
      },
      { platformId: 6, pageSize: 10, limit: 10, dryRun: true, delayMs: 300 },
    );
    expect(report).toContain('IGDB CATALOG SYNC — DRY RUN');
    expect(report).toContain('Processed:       10');
    expect(report).toContain('Accepted:        8');
    expect(report).toContain('Created:       6');
    expect(report).toContain('Quarantined:     2');
    expect(report).toContain('Status:          LIMIT_REACHED');
  });
});
