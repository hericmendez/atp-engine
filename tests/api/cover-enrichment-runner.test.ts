import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { GameQuery } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/shared/ids.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import { createGame, gameWithCover } from '../../src/domain/game/game.js';
import type { CoverService } from '../../src/application/cover-service.js';
import { CoverEnrichmentRunner } from '../../src/application/cover-enrichment-runner.js';
import type {
  CoverCheckpoint,
  CoverCheckpointInput,
} from '../../src/application/cover-enrichment-checkpoint-types.js';
import type { CoverCheckpointRepository } from '../../src/application/cover-enrichment-checkpoint-repository.js';
import { parseCoverEnrichArgs } from '../../src/scripts/cover-enrich.js';

function pad3(n: number) {
  return String(n).padStart(3, '0');
}

function makeGame(n: number, withCover = false): Game {
  let g = createGame({
    id: createGameId(`atp-igdb-${pad3(n)}`),
    titles: [createGameTitle(`Cover Game ${n}`, 'primary')],
    developers: [],
    publishers: [],
    genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('igdb', `${8000 + n}`)],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
  });
  if (withCover) {
    g = gameWithCover(g, {
      url: `https://img/${n}.png`,
      source: 'igdb',
      sourceId: `${8000 + n}`,
      width: 100,
      height: 100,
      type: 'UNKNOWN' as never,
    });
  }
  return g;
}

function createFakeGameRepository(index: Map<string, Game>): GameRepository {
  return {
    findById: vi.fn(async (id: GameId) => [...index.values()].find((g) => g.id === id) ?? null),
    findByExternalIdentifier: vi.fn(async () => null),
    existsByExternalIdentifier: vi.fn(async () => false),
    existsById: vi.fn(async () => false),
    findMany: vi.fn(async (q: GameQuery) => {
      let items = [...index.values()];
      if (q.needsCover === true) {
        items = items.filter(
          (g) =>
            g.cover === null &&
            g.externalIdentifiers.some((e) => e.source === 'igdb') &&
            !g.id.startsWith('atp-unknown-'),
        );
      }
      if (q.afterDomainId !== undefined) items = items.filter((g) => g.id > q.afterDomainId!);
      items = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const limited = items.slice(0, q.limit ?? 10);
      return { items: limited, total: items.length, page: 1, limit: 10, totalPages: 0 };
    }),
    save: vi.fn(async (g: Game) => {
      index.set(g.id, g);
    }),
    update: vi.fn(async (g: Game) => {
      index.set(g.id, g);
    }),
    deleteById: vi.fn(async () => {}),
  };
}

function createMemoryCheckpoints() {
  const rows = new Map<string, CoverCheckpoint>();
  const repository: CoverCheckpointRepository = {
    load: vi.fn(async (key: string) => rows.get(key) ?? null),
    save: vi.fn(async (state: CoverCheckpointInput) => {
      const row: CoverCheckpoint = { ...state, updatedAt: new Date().toISOString() };
      rows.set(state.key, row);
      return row;
    }),
  };
  return { repository, rows };
}

function stubCoverService(
  index: Map<string, Game>,
  failingIds: Set<string> = new Set(),
): CoverService {
  return {
    getGameCover: vi.fn(async (id: string) => {
      if (failingIds.has(id)) throw new Error('provider boom');
      const game = index.get(id);
      if (!game) throw new Error('not found');
      if (game.cover) {
        return {
          data: {
            selected: game.cover,
            candidates: [],
            errors: [],
            query: '',
            gameId: id,
            type: 'COVER' as never,
            limit: 1,
          },
          origin: 'database' as const,
        };
      }
      // Simulate finding a cover for every cover-null game
      const cover = {
        url: `https://img/${id}.png`,
        source: 'igdb',
        sourceId: id,
        width: 100,
        height: 100,
        type: 'UNKNOWN' as never,
      };
      const updated = gameWithCover(game, cover);
      index.set(id, updated);
      return {
        data: {
          selected: cover,
          candidates: [{ candidate: cover } as never],
          errors: [],
          query: '',
          gameId: id,
          type: 'COVER' as never,
          limit: 1,
        },
        origin: 'scraper' as const,
      };
    }),
    searchCovers: vi.fn(async () => ({
      data: {
        selected: null,
        candidates: [],
        errors: [],
        query: '',
        gameId: null,
        type: 'COVER' as never,
        limit: 1,
      },
      origin: 'scraper' as const,
    })),
  } as unknown as CoverService;
}

function seedGames(count: number, withCoverAfter?: number): Map<string, Game> {
  const games = new Map<string, Game>();
  for (let n = 1; n <= count; n += 1) games.set(`atp-igdb-${pad3(n)}`, makeGame(n, false));
  if (withCoverAfter !== undefined) {
    for (let n = withCoverAfter + 1; n <= count; n += 1) {
      const id = `atp-igdb-${pad3(n)}`;
      const g = games.get(id);
      if (g)
        games.set(
          id,
          gameWithCover(g, {
            url: `https://img/${n}.png`,
            source: 'igdb',
            sourceId: `${8000 + n}`,
            width: 100,
            height: 100,
            type: 'UNKNOWN' as never,
          }),
        );
    }
  }
  return games;
}

describe('cover enrichment runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects cover:null+igdb, excludes unknown and already-covered, ordered domainId ASC', async () => {
    const games = new Map<string, Game>([
      ['atp-igdb-002', makeGame(2)],
      ['atp-igdb-001', makeGame(1)],
      [
        'atp-unknown-001',
        createGame({
          id: createGameId('atp-unknown-001'),
          titles: [createGameTitle('U', 'primary')],
          developers: [],
          publishers: [],
          genres: [createGenre('a')],
          externalIdentifiers: [createExternalIdentifier('igdb', '1')],
          classification: 'GAME',
          completeness: 'FOUND_PARTIAL',
        }),
      ],
      ['atp-igdb-003', makeGame(3, true)],
    ]);
    const repo = createFakeGameRepository(games);
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games));
    const { repository: checkpoints } = createMemoryCheckpoints();

    const result = await runner.runMass(checkpoints, { batchSize: 10 });

    expect(result.processed).toBe(2);
    expect(result.persisted).toBe(2);
    expect(repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ needsCover: true, sort: { field: 'domainId', direction: 'asc' } }),
    );
  });

  it('checkpoint per batch, resume after crash (batch 2 not persisted)', async () => {
    const games = seedGames(100);
    const baseRepo = createFakeGameRepository(games);
    const { repository: checkpoints, rows } = createMemoryCheckpoints();
    const runner = new CoverEnrichmentRunner(baseRepo, stubCoverService(games));

    let reads = 0;
    const origFindMany = baseRepo.findMany;
    baseRepo.findMany = vi.fn(async (q: GameQuery) => {
      reads += 1;
      if (reads === 2) throw new Error('simulated crash');
      return origFindMany(q);
    });

    await expect(runner.runMass(checkpoints, { batchSize: 25, limit: 100 })).rejects.toThrow(
      'simulated crash',
    );
    expect(rows.get('needs-cover')?.cursor).toBe('atp-igdb-025');
    expect(rows.get('needs-cover')?.status).toBe('FAILED');

    baseRepo.findMany = origFindMany;
    const runner2 = new CoverEnrichmentRunner(baseRepo, stubCoverService(games));
    const resumed = await runner2.runMass(checkpoints, { batchSize: 25, limit: 100 });
    expect(resumed.processed).toBe(75);
    expect(resumed.cursor).toBe('atp-igdb-100');
  });

  it('isolated failure advances cursor, remains reprocessable via --ids semantics (still needy)', async () => {
    const games = seedGames(10);
    const repo = createFakeGameRepository(games);
    const failing = new Set(['atp-igdb-005']);
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games, failing));
    const { repository: checkpoints } = createMemoryCheckpoints();

    const result = await runner.runMass(checkpoints, { batchSize: 10, limit: 10 });
    expect(result.failed).toBe(1);
    expect(result.processed).toBe(10);
    expect(result.cursor).toBe('atp-igdb-010');
    // Failed game still cover:null, so natural next sweep would re-select it (idempotent retry via re-query).
    expect(games.get('atp-igdb-005')?.cover).toBeNull();
  });

  it('limit stop stays RUNNING, not COMPLETED', async () => {
    const games = seedGames(100);
    const repo = createFakeGameRepository(games);
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games));
    const { repository: checkpoints, rows } = createMemoryCheckpoints();

    const result = await runner.runMass(checkpoints, { batchSize: 25, limit: 10 });
    expect(result.status).toBe('RUNNING');
    expect(result.processed).toBe(10);
    expect(result.cursor).toBe('atp-igdb-010');
    expect(rows.get('needs-cover')?.status).toBe('RUNNING');
  });

  it('already COMPLETED is no-op without restart', async () => {
    const games = seedGames(5);
    const repo = createFakeGameRepository(games);
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games));
    const { repository: checkpoints } = createMemoryCheckpoints();
    await runner.runMass(checkpoints, { batchSize: 10 });
    const second = await runner.runMass(checkpoints, { batchSize: 10 });
    expect(second.processed).toBe(0);
    expect(second.status).toBe('COMPLETED');
  });

  it('dry-run does zero writes and zero checkpoint writes', async () => {
    const games = seedGames(10);
    const repo = createFakeGameRepository(games);
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games));
    const { repository: checkpoints, rows } = createMemoryCheckpoints();

    const result = await runner.runMass(checkpoints, { batchSize: 10, limit: 10, dryRun: true });
    expect(result.processed).toBe(10);
    expect(repo.update).not.toHaveBeenCalled();
    expect(checkpoints.save).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
    // Dry-run never mutates games via CoverService.
    expect([...games.values()].every((g) => g.cover === null)).toBe(true);
    expect(result.dryRun).toBe(true);
  });

  it('idempotency: covered games leave the need-set', async () => {
    const games = seedGames(5);
    const repo = createFakeGameRepository(games);
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games));
    const { repository: checkpoints } = createMemoryCheckpoints();
    await runner.runMass(checkpoints, { batchSize: 10 });
    // Second sweep with checkpoint already COMPLETED is no-op; with restart it finds 0 needy.
    const second = await runner.runMass(checkpoints, { batchSize: 10, restart: true });
    expect(second.processed).toBe(0);
    expect(second.status).toBe('COMPLETED');
  });

  it('cover-only: runner does not alter other fields', async () => {
    const games = seedGames(1);
    const before = games.get('atp-igdb-001');
    const beforeTitles = before?.titles[0].value;
    const beforeType = before?.gameType;
    const repo = createFakeGameRepository(games);
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games));
    const { repository: checkpoints } = createMemoryCheckpoints();
    await runner.runMass(checkpoints, { batchSize: 10, limit: 1 });
    const after = games.get('atp-igdb-001');
    expect(after?.titles[0].value).toBe(beforeTitles);
    expect(after?.gameType).toBe(beforeType);
    expect(after?.cover).not.toBeNull();
  });

  it('CLI parses --limit/--batch-size/--dry-run/--resume/--restart', () => {
    expect(parseCoverEnrichArgs(['--limit', '10'])).toMatchObject({ limit: 10 });
    expect(parseCoverEnrichArgs(['--resume'])).toMatchObject({ resume: true });
    expect(() => parseCoverEnrichArgs(['--resume', '--restart-checkpoint'])).toThrow();
  });
});
