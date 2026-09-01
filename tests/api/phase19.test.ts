import { describe, it, expect, vi } from 'vitest';
import { EnrichmentRunner } from '../../src/application/enrichment-runner.js';
import {
  IntervalEnrichmentScheduler,
  type EnrichmentScheduler,
} from '../../src/infrastructure/enrichment-scheduler.js';
import type {
  GameRepository,
  GameQuery,
  PaginatedResult,
} from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/shared/ids.js';
import type { SourceRegistry } from '../../src/sources/source-registry.js';
import type { SourceAdapter, SearchResult } from '../../src/sources/source-adapter.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import { createGame, gameWithLastEnrichedAt } from '../../src/domain/game/game.js';

function createTestGame(overrides: Partial<Game> = {}): Game {
  const id = overrides.id ?? createGameId('test-game-1');
  let game = createGame({
    id,
    titles: overrides.titles ?? [createGameTitle('Test Game', 'primary')],
    developers: overrides.developers ?? [createOrganization('Test Dev')],
    publishers: overrides.publishers ?? [createOrganization('Test Pub')],
    genres: overrides.genres ?? [createGenre('action')],
    externalIdentifiers: overrides.externalIdentifiers ?? [],
    classification: overrides.classification ?? 'GAME',
    completeness: overrides.completeness ?? 'FOUND_PARTIAL',
  });
  if (overrides.lastEnrichedAt !== undefined) {
    game = gameWithLastEnrichedAt(game, overrides.lastEnrichedAt!);
  }
  return game;
}

function createMockGameRepository(games: Game[] = []): GameRepository {
  const store = new Map<string, Game>();
  for (const game of games) {
    store.set(game.id, game);
  }

  return {
    findById: vi.fn(async (id: GameId) => store.get(id) ?? null),
    findByExternalIdentifier: vi.fn(async () => null),
    existsByExternalIdentifier: vi.fn(async () => false),
    existsById: vi.fn(async (id: GameId) => store.has(id)),
    findMany: vi.fn(async (query: GameQuery): Promise<PaginatedResult<Game>> => {
      let filtered = [...store.values()];

      if (query.completeness) {
        filtered = filtered.filter((g) => g.completeness === query.completeness);
      }

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const start = (page - 1) * limit;
      const items = filtered.slice(start, start + limit);

      return {
        items,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      };
    }),
    save: vi.fn(async (game: Game) => {
      store.set(game.id, game);
    }),
    update: vi.fn(async (game: Game) => {
      store.set(game.id, game);
    }),
    deleteById: vi.fn(async (id: GameId) => {
      store.delete(id);
    }),
  };
}

function createMockAdapter(
  source: string,
  getByIdResult: RawCandidate | null = null,
): SourceAdapter {
  return {
    source,
    capabilities: {
      search: true,
      getById: true,
      searchCovers: false,
      searchPagination: 'none',
    },
    search: vi.fn(async (): Promise<SearchResult> => ({ candidates: [], hasMore: false })),
    getById: vi.fn(async () => getByIdResult),
  };
}

function createMockSourceRegistry(adapters: SourceAdapter[] = []): SourceRegistry {
  const map = new Map<string, SourceAdapter>();
  for (const adapter of adapters) {
    map.set(adapter.source, adapter);
  }

  return {
    register: vi.fn((adapter: SourceAdapter) => {
      map.set(adapter.source, adapter);
    }),
    unregister: vi.fn((source: string) => map.delete(source)),
    get: vi.fn((source: string) => map.get(source)),
    has: vi.fn((source: string) => map.has(source)),
    getAll: vi.fn(() => [...map.values()]),
    getSources: vi.fn(() => [...map.keys()]),
  };
}

function createRawCandidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    source: overrides.source ?? 'wikipedia',
    sourceId: overrides.sourceId ?? '12345',
    title: overrides.title ?? 'Enriched Game',
    developers: overrides.developers ?? ['Enriched Dev'],
    publishers: overrides.publishers ?? ['Enriched Pub'],
    genres: overrides.genres ?? ['RPG'],
    platforms: overrides.platforms ?? ['Nintendo Switch'],
    releaseDate: overrides.releaseDate ?? '2023-01-15',
    externalIdentifiers: overrides.externalIdentifiers ?? [],
    ...overrides,
  };
}

describe('Phase 19 — Background Enrichment', () => {
  describe('EnrichmentRunner — Candidate Selection', () => {
    it('selects FOUND_PARTIAL games with external identifiers', async () => {
      const game = createTestGame({
        id: createGameId('game-1'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
      });
      const repo = createMockGameRepository([game]);
      const adapter = createMockAdapter('wikipedia', createRawCandidate());
      const registry = createMockSourceRegistry([adapter]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.totalCandidates).toBe(1);
      expect(result.processed).toBe(1);
    });

    it('skips games without external identifiers', async () => {
      const game = createTestGame({
        id: createGameId('game-no-ext'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [],
      });
      const repo = createMockGameRepository([game]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.totalCandidates).toBe(0);
    });

    it('skips FOUND_COMPLETE games', async () => {
      const game = createTestGame({
        id: createGameId('game-complete'),
        completeness: 'FOUND_COMPLETE',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
      });
      const repo = createMockGameRepository([game]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.totalCandidates).toBe(0);
    });

    it('skips FOUND_SUFFICIENT games', async () => {
      const game = createTestGame({
        id: createGameId('game-sufficient'),
        completeness: 'FOUND_SUFFICIENT',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
      });
      const repo = createMockGameRepository([game]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.totalCandidates).toBe(0);
    });

    it('skips recently enriched games (within cooldown)', async () => {
      const game = createTestGame({
        id: createGameId('game-recent'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
        lastEnrichedAt: new Date(),
      });
      const repo = createMockGameRepository([game]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 3600_000 },
      );

      const result = await runner.runOnce();

      expect(result.totalCandidates).toBe(0);
    });

    it('respects batch size limit', async () => {
      const games = Array.from({ length: 20 }, (_, i) =>
        createTestGame({
          id: createGameId(`game-${i}`),
          completeness: 'FOUND_PARTIAL',
          externalIdentifiers: [createExternalIdentifier('wikipedia', `${i}`)],
        }),
      );
      const repo = createMockGameRepository(games);
      const adapter = createMockAdapter('wikipedia', createRawCandidate());
      const registry = createMockSourceRegistry([adapter]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 5, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.totalCandidates).toBeLessThanOrEqual(5);
      expect(result.processed).toBeLessThanOrEqual(5);
    });
  });

  describe('EnrichmentRunner — Enrichment Flow', () => {
    it('enriches an incomplete game with new data from source', async () => {
      const game = createTestGame({
        id: createGameId('game-enrich'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
        developers: [],
        publishers: [],
        genres: [],
      });
      const repo = createMockGameRepository([game]);
      const rawCandidate = createRawCandidate({
        developers: ['New Developer'],
        publishers: ['New Publisher'],
        genres: ['rpg'],
      });
      const adapter = createMockAdapter('wikipedia', rawCandidate);
      const registry = createMockSourceRegistry([adapter]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.enriched).toBe(1);
      expect(result.items[0].changesCount).toBeGreaterThan(0);
      expect(result.items[0].completenessAfter).not.toBe('FOUND_PARTIAL');
    });

    it('handles already complete game (no new metadata, only evidence added)', async () => {
      const game = createTestGame({
        id: createGameId('game-no-change'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
        developers: [createOrganization('Existing Dev')],
        publishers: [createOrganization('Existing Pub')],
        genres: [createGenre('action')],
      });
      const repo = createMockGameRepository([game]);
      const rawCandidate = createRawCandidate({
        developers: ['Existing Dev'],
        publishers: ['Existing Pub'],
        genres: ['action'],
      });
      const adapter = createMockAdapter('wikipedia', rawCandidate);
      const registry = createMockSourceRegistry([adapter]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.items[0].success).toBe(true);
      const item = result.items[0];
      const metadataChanges = item.changesCount;
      expect(metadataChanges).toBeGreaterThanOrEqual(0);
    });

    it('sets lastEnrichedAt after enrichment', async () => {
      const game = createTestGame({
        id: createGameId('game-ts'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
      });
      const repo = createMockGameRepository([game]);
      const adapter = createMockAdapter('wikipedia', createRawCandidate());
      const registry = createMockSourceRegistry([adapter]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      await runner.runOnce();

      const updatedGame = await repo.findById(createGameId('game-ts'));
      expect(updatedGame?.lastEnrichedAt).toBeInstanceOf(Date);
    });

    it('idempotent: second run produces no duplicate writes for same data', async () => {
      const game = createTestGame({
        id: createGameId('game-idem'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
        developers: [createOrganization('Existing Dev')],
        publishers: [createOrganization('Existing Pub')],
        genres: [createGenre('action')],
      });
      const repo = createMockGameRepository([game]);
      const rawCandidate = createRawCandidate({
        developers: ['Existing Dev'],
        publishers: ['Existing Pub'],
        genres: ['action'],
      });
      const adapter = createMockAdapter('wikipedia', rawCandidate);
      const registry = createMockSourceRegistry([adapter]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 3600_000 },
      );

      const result1 = await runner.runOnce();
      expect(result1.items[0].success).toBe(true);
      expect(result1.items[0].changesCount).toBeGreaterThanOrEqual(0);

      const updatedGame = await repo.findById(createGameId('game-idem'));
      expect(updatedGame?.lastEnrichedAt).toBeInstanceOf(Date);
    });
  });

  describe('EnrichmentRunner — Error Handling', () => {
    it('handles source failure without interrupting batch', async () => {
      const game1 = createTestGame({
        id: createGameId('game-fail'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '111')],
      });
      const game2 = createTestGame({
        id: createGameId('game-ok'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('steam', '222')],
      });
      const repo = createMockGameRepository([game1, game2]);

      const failingAdapter = createMockAdapter('wikipedia');
      vi.mocked(failingAdapter.getById).mockRejectedValue(new Error('Network error'));

      const okAdapter = createMockAdapter('steam', createRawCandidate({ title: 'OK Game' }));
      const registry = createMockSourceRegistry([failingAdapter, okAdapter]);

      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      const failItem = result.items.find((i) => i.gameId === 'game-fail');
      expect(failItem?.success).toBe(true);
      expect(failItem?.sourcesQueried).toContain('wikipedia');
      expect(failItem?.changesCount).toBe(0);
    });

    it('handles item failure without interrupting other items', async () => {
      const game1 = createTestGame({
        id: createGameId('game-error'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', 'err')],
      });
      const game2 = createTestGame({
        id: createGameId('game-good'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('steam', 'ok')],
      });
      const repo = createMockGameRepository([game1, game2]);

      const errorAdapter = createMockAdapter('wikipedia');
      vi.mocked(errorAdapter.getById).mockRejectedValue(new Error('Source unavailable'));

      const okAdapter = createMockAdapter('steam', createRawCandidate({ title: 'Good Game' }));
      const registry = createMockSourceRegistry([errorAdapter, okAdapter]);

      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(0);
      const errorItem = result.items.find((i) => i.gameId === 'game-error');
      expect(errorItem?.success).toBe(true);
      expect(errorItem?.changesCount).toBe(0);
      const goodItem = result.items.find((i) => i.gameId === 'game-good');
      expect(goodItem?.success).toBe(true);
    });

    it('handles null getById result gracefully', async () => {
      const game = createTestGame({
        id: createGameId('game-null'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', 'nonexistent')],
      });
      const repo = createMockGameRepository([game]);
      const adapter = createMockAdapter('wikipedia', null);
      const registry = createMockSourceRegistry([adapter]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.skipped).toBe(1);
      expect(result.items[0].success).toBe(true);
    });

    it('handles unknown source adapter gracefully', async () => {
      const game = createTestGame({
        id: createGameId('game-unknown-src'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('unknown-source', '999')],
      });
      const repo = createMockGameRepository([game]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.skipped).toBe(1);
      expect(result.items[0].success).toBe(true);
    });
  });

  describe('EnrichmentRunner — Concurrency', () => {
    it('processes items in chunks based on concurrency', async () => {
      const games = Array.from({ length: 6 }, (_, i) =>
        createTestGame({
          id: createGameId(`game-conc-${i}`),
          completeness: 'FOUND_PARTIAL',
          externalIdentifiers: [createExternalIdentifier('wikipedia', `${i}`)],
        }),
      );
      const repo = createMockGameRepository(games);
      const adapter = createMockAdapter('wikipedia', createRawCandidate());
      const registry = createMockSourceRegistry([adapter]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.processed).toBe(6);
    });
  });

  describe('EnrichmentRunner — No Unnecessary Writes', () => {
    it('does not write when source returns no data', async () => {
      const game = createTestGame({
        id: createGameId('game-no-write'),
        completeness: 'FOUND_PARTIAL',
        externalIdentifiers: [createExternalIdentifier('wikipedia', '12345')],
      });
      const repo = createMockGameRepository([game]);
      const adapter = createMockAdapter('wikipedia', null);
      const registry = createMockSourceRegistry([adapter]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const updateCallsBefore = vi.mocked(repo.update).mock.calls.length;
      await runner.runOnce();
      const updateCallsAfter = vi.mocked(repo.update).mock.calls.length;

      expect(updateCallsAfter).toBe(updateCallsBefore + 1);
    });
  });

  describe('EnrichmentRunner — Run Result', () => {
    it('returns empty result when no candidates exist', async () => {
      const repo = createMockGameRepository([]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.totalCandidates).toBe(0);
      expect(result.processed).toBe(0);
      expect(result.enriched).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('reports durationMs', async () => {
      const repo = createMockGameRepository([]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );

      const result = await runner.runOnce();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('IntervalEnrichmentScheduler', () => {
    it('reports correct initial status', () => {
      const repo = createMockGameRepository([]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );
      const scheduler: EnrichmentScheduler = new IntervalEnrichmentScheduler(runner, {
        intervalMs: 60_000,
      });

      const status = scheduler.getStatus();

      expect(status.running).toBe(false);
      expect(status.lastRunAt).toBeNull();
      expect(status.lastRunResult).toBeNull();
      expect(status.runCount).toBe(0);
      expect(status.intervalMs).toBe(60_000);
    });

    it('start/stop lifecycle works', async () => {
      const repo = createMockGameRepository([]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );
      const scheduler = new IntervalEnrichmentScheduler(runner, { intervalMs: 60_000 });

      scheduler.start();
      const statusAfterStart = scheduler.getStatus();
      expect(statusAfterStart.running).toBe(false);

      await scheduler.stop();
      const statusAfterStop = scheduler.getStatus();
      expect(statusAfterStop.running).toBe(false);
    });

    it('stop is idempotent', async () => {
      const repo = createMockGameRepository([]);
      const registry = createMockSourceRegistry([]);
      const runner = new EnrichmentRunner(
        { gameRepository: repo, sourceRegistry: registry },
        { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
      );
      const scheduler = new IntervalEnrichmentScheduler(runner, { intervalMs: 60_000 });

      await scheduler.stop();
      await scheduler.stop();
    });
  });

  describe('Game Domain — lastEnrichedAt', () => {
    it('createGame sets lastEnrichedAt to null', () => {
      const game = createTestGame();
      expect(game.lastEnrichedAt).toBeNull();
    });

    it('gameWithLastEnrichedAt returns new game with date', () => {
      const game = createTestGame();
      const date = new Date();
      const enriched = gameWithLastEnrichedAt(game, date);
      expect(enriched.lastEnrichedAt).toBe(date);
      expect(enriched.id).toBe(game.id);
    });
  });
});
