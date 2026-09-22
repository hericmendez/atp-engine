import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnrichmentRunner } from '../../src/application/enrichment-runner.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { GameQuery } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/game/game.js';
import type { SourceAdapter, SearchResult } from '../../src/sources/source-adapter.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import { createGame } from '../../src/domain/game/game.js';
import type {
  EnrichmentCheckpoint,
  EnrichmentCheckpointInput,
} from '../../src/application/enrichment-checkpoint-types.js';
import type { EnrichmentCheckpointRepository } from '../../src/application/enrichment-checkpoint-repository.js';
import { parseEnrichArgs } from '../../src/scripts/enrich-igdb.js';

// ─── Fakes (Mongo semantics mirrored: need-filter + domainId cursor) ───

function makeGame(n: number, padded: (n: number) => string): Game {
  return createGame({
    id: createGameId(`atp-igdb-${padded(n)}`),
    titles: [createGameTitle(`Checkpoint Game ${n}`, 'primary')],
    developers: [],
    publishers: [],
    genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('igdb', `${9000 + n}`)],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
  });
}

function makeRaw(n: number, padded: (n: number) => string): RawCandidate {
  return {
    source: 'igdb',
    sourceId: `${9000 + n}`,
    title: `Checkpoint Game ${n}`,
    platforms: ['PC'],
    developers: [`Dev ${padded(n)}`],
    publishers: [`Pub ${padded(n)}`],
    genres: ['action'],
    releaseDate: '2020-01-15',
    description: 'Checkpoint description',
    coverUrls: [],
    externalIdentifiers: [{ source: 'igdb', id: `${9000 + n}` }],
    gameType: 'main_game',
    gameStatus: 'released',
    classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'test' }],
  };
}

const pad3 = (n: number) => String(n).padStart(3, '0');

function createFakeGameRepository(index: Map<string, Game>): GameRepository {
  return {
    findById: vi.fn(async (id: GameId) => [...index.values()].find((g) => g.id === id) ?? null),
    findByExternalIdentifier: vi.fn(async () => null),
    existsByExternalIdentifier: vi.fn(async () => false),
    existsById: vi.fn(async () => false),
    findMany: vi.fn(async (q: GameQuery) => {
      let items = [...index.values()];
      if (q.needsCompanies === true) {
        items = items.filter(
          (g) =>
            (g.developers.length === 0 || g.publishers.length === 0) &&
            g.externalIdentifiers.some((e) => e.source === 'igdb') &&
            !g.id.startsWith('atp-unknown-'),
        );
      } else if (q.completeness !== undefined) {
        items = items.filter((g) => g.completeness === q.completeness);
      }
      if (q.afterDomainId !== undefined) {
        items = items.filter((g) => g.id > q.afterDomainId!);
      }
      items = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const limited = items.slice(0, q.limit ?? 10);
      return { items: limited, total: items.length, page: 1, limit: 10, totalPages: 0 };
    }),
    save: vi.fn(async (game: Game) => {
      index.set(game.id, game);
    }),
    update: vi.fn(async (game: Game) => {
      index.set(game.id, game);
    }),
    deleteById: vi.fn(async () => {}),
  };
}

function createMemoryCheckpoints() {
  const rows = new Map<string, EnrichmentCheckpoint>();
  const repository: EnrichmentCheckpointRepository = {
    load: vi.fn(async (key: string) => rows.get(key) ?? null),
    save: vi.fn(async (state: EnrichmentCheckpointInput) => {
      const row: EnrichmentCheckpoint = { ...state, updatedAt: new Date().toISOString() };
      rows.set(state.key, row);
      return row;
    }),
  };
  return { repository, rows };
}

function mockAdapter(
  responder: (n: number) => RawCandidate | null,
  calls: Map<string, number>,
): SourceAdapter {
  return {
    source: 'igdb',
    capabilities: { search: true, getById: true, searchCovers: false, searchPagination: 'none' },
    search: vi.fn(async (): Promise<SearchResult> => ({ candidates: [], hasMore: false })),
    getById: vi.fn(async (id: string) => {
      calls.set(id, (calls.get(id) ?? 0) + 1);
      return responder(Number(id) - 9000);
    }),
  };
}

function createRunner(
  gameRepository: GameRepository,
  adapter: SourceAdapter,
  extraOptions: Record<string, unknown> = {},
) {
  const registry = {
    register: vi.fn(),
    get: vi.fn(() => adapter),
  } as unknown as {
    register: (a: SourceAdapter) => void;
    get: (s: string) => SourceAdapter | undefined;
  };
  return new EnrichmentRunner(
    { gameRepository, sourceRegistry: registry as never },
    {
      batchSize: 25,
      concurrency: 2,
      itemTimeoutMs: 5000,
      cooldownMs: 0,
      ...extraOptions,
    },
  );
}

function seedGames(count: number): Map<string, Game> {
  const games = new Map<string, Game>();
  for (let n = 1; n <= count; n += 1) {
    const game = makeGame(n, pad3);
    games.set(game.id, game);
  }
  return games;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('enrichment checkpoint: ordering and resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects in deterministic domainId ASC order (same state, same order)', async () => {
    const games = seedGames(100);
    const repo = createFakeGameRepository(games);
    const calls = new Map<string, number>();
    const runner = createRunner(
      repo,
      mockAdapter((n) => makeRaw(n, pad3), calls),
    );
    const { repository: checkpoints } = createMemoryCheckpoints();

    const first = await runner.runNeedsCompaniesMass(checkpoints, {
      batchSize: 100,
      limit: 10,
      dryRun: true,
    });
    const order1 = [...calls.keys()];
    calls.clear();
    // Fresh runner, restarted cursor, same untouched need-set: same first page again.
    const runner2 = createRunner(
      repo,
      mockAdapter((n) => makeRaw(n, pad3), calls),
    );
    const second = await runner2.runNeedsCompaniesMass(checkpoints, {
      batchSize: 100,
      limit: 10,
      restart: true,
      dryRun: true,
    });

    expect(first.cursor).toBe('atp-igdb-010');
    expect(second.cursor).toBe('atp-igdb-010');
    expect(order1).toEqual([...calls.keys()]);
    expect(order1).toEqual(Array.from({ length: 10 }, (_, i) => `${9000 + i + 1}`));
  });

  it('crash between batches resumes after the last persisted batch (37 -> 38)', async () => {
    const games = seedGames(100);
    const baseRepo = createFakeGameRepository(games);
    const calls = new Map<string, number>();
    const runner = createRunner(
      baseRepo,
      mockAdapter((n) => makeRaw(n, pad3), calls),
    );
    const { repository: checkpoints, rows } = createMemoryCheckpoints();

    // Crash on the 2nd selection read: batch 1 (25) fully persisted,
    // batch 2 never started.
    let reads = 0;
    const dyingFindMany = baseRepo.findMany;
    baseRepo.findMany = vi.fn(async (q: GameQuery) => {
      reads += 1;
      if (reads === 2) throw new Error('simulated crash');
      return dyingFindMany(q);
    });
    await expect(
      runner.runNeedsCompaniesMass(checkpoints, { batchSize: 25, limit: 100 }),
    ).rejects.toThrow('simulated crash');

    const crashedAt = rows.get('needs-companies');
    expect(crashedAt?.cursor).toBe('atp-igdb-025');
    expect(crashedAt?.status).toBe('FAILED');
    const callsBefore = new Map(calls);

    // Restart with a healthy store: resumes at 26, never reprocesses 1-25.
    baseRepo.findMany = dyingFindMany;
    const runner2 = createRunner(
      baseRepo,
      mockAdapter((n) => makeRaw(n, pad3), calls),
    );
    const resumed = await runner2.runNeedsCompaniesMass(checkpoints, {
      batchSize: 25,
      limit: 100,
    });

    expect(resumed.cursor).toBe('atp-igdb-100');
    for (let n = 1; n <= 25; n += 1) {
      expect(calls.get(`${9000 + n}`)).toBe(callsBefore.get(`${9000 + n}`));
    }
    for (let n = 26; n <= 100; n += 1) {
      expect(calls.get(`${9000 + n}`)).toBe(1);
    }
    expect(resumed.processed).toBe(75);
  });

  it('item failure inside a batch is counted, cursor passes, --ids can revisit', async () => {
    const games = seedGames(25);
    const repo = createFakeGameRepository(games);
    // Item 17 fails at persist time.
    repo.update = vi.fn(async (game: Game) => {
      if (game.id === 'atp-igdb-017') throw new Error('persist boom');
      games.set(game.id, game);
    });
    const calls = new Map<string, number>();
    const runner = createRunner(
      repo,
      mockAdapter((n) => makeRaw(n, pad3), calls),
    );
    const { repository: checkpoints } = createMemoryCheckpoints();

    const result = await runner.runNeedsCompaniesMass(checkpoints, { batchSize: 25, limit: 25 });

    expect(result.failed).toBe(1);
    expect(result.processed).toBe(25);
    // Limit stop stays RUNNING (resumable) even at the exact boundary —
    // the cursor advanced past the failed item (counted, not lost).
    expect(result.status).toBe('RUNNING');
    expect(result.cursor).toBe('atp-igdb-025');
    // A follow-up sweep finds nothing after the cursor: COMPLETED, zero rework.
    const followup = await createRunner(
      repo,
      mockAdapter((n) => makeRaw(n, pad3), calls),
    ).runNeedsCompaniesMass(checkpoints, { batchSize: 25 });
    expect(followup.status).toBe('COMPLETED');
    expect(followup.processed).toBe(0);
    // The failed item stays needy and is explicitly reprocessable.
    expect(games.get('atp-igdb-017')?.developers).toEqual([]);
    const explicit = await new EnrichmentRunner(
      {
        gameRepository: repo,
        sourceRegistry: {
          register: vi.fn(),
          get: vi.fn(() => mockAdapter((n) => makeRaw(n, pad3), calls)),
        } as never,
      },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0, ids: ['atp-igdb-017'] },
    ).runOnce();
    expect(explicit.processed).toBe(1);
  });

  it('idempotent rerun after COMPLETED is a no-op (no writes, single row)', async () => {
    const games = seedGames(10);
    const repo = createFakeGameRepository(games);
    const calls = new Map<string, number>();
    const adapter = mockAdapter((n) => makeRaw(n, pad3), calls);
    const { repository: checkpoints, rows } = createMemoryCheckpoints();

    const first = await createRunner(repo, adapter).runNeedsCompaniesMass(checkpoints, {
      batchSize: 25,
    });
    expect(first.status).toBe('COMPLETED');
    const updateCalls = (repo.update as ReturnType<typeof vi.fn>).mock.calls.length;

    const second = await createRunner(repo, adapter).runNeedsCompaniesMass(checkpoints, {
      batchSize: 25,
    });

    expect(second.status).toBe('COMPLETED');
    expect(second.processed).toBe(0);
    expect(second.batches).toBe(0);
    expect((repo.update as ReturnType<typeof vi.fn>).mock.calls.length).toBe(updateCalls);
    expect(rows.size).toBe(1);
    expect(calls.size).toBe(10);
  });

  it('dynamic selection shrink never skips: A/B leave the need-set, C/D/E follow', async () => {
    const games = seedGames(5);
    const repo = createFakeGameRepository(games);
    const calls = new Map<string, number>();
    const { repository: checkpoints } = createMemoryCheckpoints();

    // Process A/B with a limit; they gain companies and leave the set.
    const runner = createRunner(
      repo,
      mockAdapter((n) => makeRaw(n, pad3), calls),
    );
    const first = await runner.runNeedsCompaniesMass(checkpoints, { batchSize: 25, limit: 2 });
    expect(first.cursor).toBe('atp-igdb-002');
    expect(games.get('atp-igdb-001')?.developers.length).toBeGreaterThan(0);

    // Restart: cursor-based re-query returns C/D/E only — no skip, no repeat.
    const runner2 = createRunner(
      repo,
      mockAdapter((n) => makeRaw(n, pad3), calls),
    );
    const second = await runner2.runNeedsCompaniesMass(checkpoints, { batchSize: 25 });

    expect(second.processed).toBe(3);
    expect(second.cursor).toBe('atp-igdb-005');
    expect(calls.get('9001')).toBe(1);
    expect(calls.get('9002')).toBe(1);
    for (const n of [3, 4, 5]) {
      expect(calls.get(`${9000 + n}`)).toBe(1);
    }
  });

  it('dry-run computes with zero game writes and zero checkpoint writes', async () => {
    const games = seedGames(30);
    const repo = createFakeGameRepository(games);
    const calls = new Map<string, number>();
    const runner = createRunner(
      repo,
      mockAdapter((n) => makeRaw(n, pad3), calls),
    );
    const { repository: checkpoints, rows } = createMemoryCheckpoints();

    const result = await runner.runNeedsCompaniesMass(checkpoints, {
      batchSize: 10,
      limit: 10,
      dryRun: true,
    });

    expect(result.processed).toBe(10);
    expect(result.enriched).toBe(10);
    expect(repo.update).not.toHaveBeenCalled();
    expect(checkpoints.save).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
    expect([...games.values()].every((g) => g.developers.length === 0)).toBe(true);
  });

  it('CLI rejects --restart-checkpoint outside --needs-companies sweeps', () => {
    expect(() => parseEnrichArgs(['--ids', 'a', '--restart-checkpoint'])).toThrow(
      '--restart-checkpoint',
    );
    expect(() => parseEnrichArgs(['--limit', '10', '--restart-checkpoint'])).toThrow(
      '--restart-checkpoint',
    );
    expect(
      parseEnrichArgs(['--needs-companies', '--limit', '10', '--restart-checkpoint']),
    ).toMatchObject({ restartCheckpoint: true });
  });
});
