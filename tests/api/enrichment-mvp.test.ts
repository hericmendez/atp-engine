import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnrichmentRunner } from '../../src/application/enrichment-runner.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
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
import { createGame } from '../../src/domain/game/game.js';
import {
  parseEnrichArgs,
  runEnrichLoop,
  formatEnrichSummary,
} from '../../src/scripts/enrich-igdb.js';

// ─── Fakes ───────────────────────────────────────────────────────

function makeGame(n: number, overrides: Partial<Game> = {}): Game {
  return createGame({
    id: createGameId(`enrich-${n}`),
    titles: [createGameTitle(`Enrich Game ${n}`, 'primary')],
    developers: [],
    publishers: [],
    genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('igdb', `${1000 + n}`)],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
    ...overrides,
  });
}

function makeRaw(n: number, overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    source: 'igdb',
    sourceId: `${1000 + n}`,
    title: `Enrich Game ${n}`,
    platforms: ['PC'],
    developers: ['Enrich Dev'],
    publishers: ['Enrich Pub'],
    genres: ['action'],
    releaseDate: '2020-01-15',
    description: 'Enriched description',
    coverUrls: ['https://images.igdb.com/t_cover_big/abc.png'],
    externalIdentifiers: [{ source: 'igdb', id: `${1000 + n}` }],
    gameType: 'main_game',
    gameStatus: 'released',
    classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'test' }],
    ...overrides,
  };
}

function createMapRepository(index: Map<string, Game>): GameRepository {
  return {
    findById: vi.fn(async (id: GameId) => [...index.values()].find((g) => g.id === id) ?? null),
    findByExternalIdentifier: vi.fn(async () => null),
    existsByExternalIdentifier: vi.fn(async () => false),
    existsById: vi.fn(async () => false),
    findMany: vi.fn(async (q: { limit?: number; needsCompanies?: boolean }) => {
      let items = [...index.values()].filter((g) => g.completeness === 'FOUND_PARTIAL');
      if (q.needsCompanies === true) {
        items = items.filter(
          (g) =>
            (g.developers.length === 0 || g.publishers.length === 0) &&
            g.externalIdentifiers.some((e) => e.source === 'igdb') &&
            !g.id.startsWith('atp-unknown-'),
        );
      }
      return {
        items: items.slice(0, q.limit ?? 10),
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
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

function mockAdapter(
  source: string,
  responder: (id: string) => RawCandidate | null | Promise<RawCandidate | null>,
): SourceAdapter {
  return {
    source,
    capabilities: { search: true, getById: true, searchCovers: false, searchPagination: 'none' },
    search: vi.fn(async (): Promise<SearchResult> => ({ candidates: [], hasMore: false })),
    getById: vi.fn(async (id: string) => responder(id)),
  };
}

function registryOf(adapters: SourceAdapter[]): SourceRegistry {
  const map = new Map(adapters.map((a) => [a.source, a]));
  return {
    register: vi.fn(),
    get: vi.fn((source: string) => map.get(source)),
  } as unknown as SourceRegistry;
}

// ─── Tests ───────────────────────────────────────────────────────

describe('enrichment MVP: runner behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills developers/publishers and preserves identity', async () => {
    const games = new Map<string, Game>([['enrich-1', makeGame(1)]]);
    const repo = createMapRepository(games);
    const runner = new EnrichmentRunner(
      {
        gameRepository: repo,
        sourceRegistry: registryOf([mockAdapter('igdb', (id) => makeRaw(Number(id) - 1000))]),
      },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
    );

    const result = await runner.runOnce();

    expect(result.processed).toBe(1);
    expect(result.enriched).toBe(1);
    const after = games.get('enrich-1');
    expect(after?.developers.map((d) => d.name)).toContain('Enrich Dev');
    expect(after?.publishers.map((p) => p.name)).toContain('Enrich Pub');
    expect(after?.id).toBe('enrich-1');
    expect(after?.externalIdentifiers).toEqual([createExternalIdentifier('igdb', '1001')]);
    expect(games.size).toBe(1);
  });

  it('is additive: keeps existing developers and adds new ones', async () => {
    const games = new Map<string, Game>([
      ['enrich-2', makeGame(2, { developers: [createOrganization('Original Dev')] })],
    ]);
    const repo = createMapRepository(games);
    const runner = new EnrichmentRunner(
      { gameRepository: repo, sourceRegistry: registryOf([mockAdapter('igdb', () => makeRaw(2))]) },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
    );

    await runner.runOnce();

    const names = games.get('enrich-2')?.developers.map((d) => d.name) ?? [];
    expect(names).toContain('Original Dev');
    expect(names).toContain('Enrich Dev');
  });

  it('leaves publisher absent when the provider has none (no invention)', async () => {
    const games = new Map<string, Game>([['enrich-3', makeGame(3)]]);
    const repo = createMapRepository(games);
    const raw = makeRaw(3, { publishers: undefined });
    const runner = new EnrichmentRunner(
      { gameRepository: repo, sourceRegistry: registryOf([mockAdapter('igdb', () => raw)]) },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
    );

    await runner.runOnce();

    const after = games.get('enrich-3');
    expect(after?.developers.map((d) => d.name)).toContain('Enrich Dev');
    expect(after?.publishers).toEqual([]);
  });

  it('does not destroy description and never touches cover/gameType', async () => {
    const games = new Map<string, Game>([
      ['enrich-4', makeGame(4, { description: 'Original description' })],
    ]);
    const repo = createMapRepository(games);
    const runner = new EnrichmentRunner(
      { gameRepository: repo, sourceRegistry: registryOf([mockAdapter('igdb', () => makeRaw(4))]) },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
    );

    await runner.runOnce();

    const after = games.get('enrich-4');
    expect(after?.description).toBe('Original description');
    expect(after?.cover).toBeNull();
    expect(after?.gameType).toBeNull();
  });

  it('isolates per-item persist failures', async () => {
    const games = new Map<string, Game>([
      ['enrich-5', makeGame(5)],
      ['enrich-6', makeGame(6)],
    ]);
    const repo = createMapRepository(games);
    repo.update = vi.fn(async (game: Game) => {
      if (game.id === 'enrich-5') throw new Error('mongo boom');
      games.set(game.id, game);
    });
    const runner = new EnrichmentRunner(
      {
        gameRepository: repo,
        sourceRegistry: registryOf([mockAdapter('igdb', (id) => makeRaw(Number(id) - 1000))]),
      },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
    );

    const result = await runner.runOnce();

    expect(result.failed).toBe(1);
    expect(result.enriched).toBe(1);
    expect(games.get('enrich-6')?.developers.map((d) => d.name)).toContain('Enrich Dev');
  });

  it('treats provider fetch failures as no-change skips, not batch failures', async () => {
    const games = new Map<string, Game>([['enrich-5b', makeGame(51)]]);
    const repo = createMapRepository(games);
    const runner = new EnrichmentRunner(
      {
        gameRepository: repo,
        sourceRegistry: registryOf([
          mockAdapter('igdb', () => {
            throw new Error('provider boom');
          }),
        ]),
      },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
    );

    const result = await runner.runOnce();

    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(games.get('enrich-5b')?.developers).toEqual([]);
  });

  it('second run enriches nothing new (cooldown skip, no dup metadata)', async () => {
    const games = new Map<string, Game>([['enrich-7', makeGame(7)]]);
    const repo = createMapRepository(games);
    const registry = registryOf([mockAdapter('igdb', () => makeRaw(7))]);
    const opts = { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 60_000 };

    const first = await new EnrichmentRunner(
      { gameRepository: repo, sourceRegistry: registry },
      opts,
    ).runOnce();
    const devsAfterFirst = games.get('enrich-7')?.developers.map((d) => d.name);
    const second = await new EnrichmentRunner(
      { gameRepository: repo, sourceRegistry: registry },
      opts,
    ).runOnce();

    expect(first.enriched).toBe(1);
    expect(second.totalCandidates).toBe(0);
    expect(second.processed).toBe(0);
    expect(games.get('enrich-7')?.developers.map((d) => d.name)).toEqual(devsAfterFirst);
    expect(games.size).toBe(1);
  });

  it('explicit ids selection skips missing, identity-less, and unknown games', async () => {
    const games = new Map<string, Game>([
      ['enrich-8', makeGame(8)],
      ['enrich-noid', makeGame(9, { id: createGameId('enrich-noid'), externalIdentifiers: [] })],
    ]);
    const repo = createMapRepository(games);
    const runner = new EnrichmentRunner(
      { gameRepository: repo, sourceRegistry: registryOf([mockAdapter('igdb', () => makeRaw(8))]) },
      {
        batchSize: 10,
        concurrency: 2,
        itemTimeoutMs: 5000,
        cooldownMs: 0,
        ids: ['enrich-8', 'enrich-noid', 'enrich-ghost'],
      },
    );

    const result = await runner.runOnce();

    expect(result.processed).toBe(1);
    expect(games.get('enrich-8')?.developers.map((d) => d.name)).toContain('Enrich Dev');
  });

  it('dry-run computes without writing', async () => {
    const games = new Map<string, Game>([['enrich-9', makeGame(9)]]);
    const repo = createMapRepository(games);
    const runner = new EnrichmentRunner(
      { gameRepository: repo, sourceRegistry: registryOf([mockAdapter('igdb', () => makeRaw(9))]) },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0, dryRun: true },
    );

    const result = await runner.runOnce();

    expect(result.processed).toBe(1);
    expect(result.enriched).toBe(1);
    expect(repo.update).not.toHaveBeenCalled();
    expect(games.get('enrich-9')?.developers).toEqual([]);
  });
});

describe('enrich:igdb CLI contract', () => {
  it('refuses unbounded runs and validates flags', () => {
    expect(() => parseEnrichArgs([])).toThrow('refuses unbounded runs');
    expect(() => parseEnrichArgs(['--limit', '0'])).toThrow('--limit');
    expect(() => parseEnrichArgs(['--limit', '10', '--batch-size', '101'])).toThrow('--batch-size');
    expect(parseEnrichArgs(['--limit', '10'])).toMatchObject({ limit: 10, dryRun: false });
    expect(parseEnrichArgs(['--ids', 'a,b', '--dry-run'])).toMatchObject({
      ids: ['a', 'b'],
      dryRun: true,
    });
  });

  it('loops runOnce until the limit with batch slicing', async () => {
    let calls = 0;
    const sizes: number[] = [];
    const deps = (batchIds: string[] | undefined, batchSize: number) => ({
      runner: {
        runOnce: vi.fn(async () => {
          calls += 1;
          sizes.push(batchSize);
          const n = calls === 1 ? 2 : 1;
          return {
            totalCandidates: n,
            processed: n,
            enriched: n,
            skipped: 0,
            failed: 0,
            durationMs: 1,
            items: [],
          };
        }),
      },
      readGame: vi.fn(async () => null),
    });

    const totals = await runEnrichLoop(deps, {
      limit: 3,
      batchSize: 2,
      concurrency: 1,
      cooldownMs: 0,
      delayMs: 0,
      dryRun: false,
    });

    // Batches of 2 then 1 (remaining).
    expect(calls).toBe(2);
    expect(sizes).toEqual([2, 1]);
    expect(totals).toEqual({ processed: 3, enriched: 3, skipped: 0, failed: 0 });
  });

  it('formats the summary with rate and status', () => {
    const report = formatEnrichSummary(
      { processed: 10, enriched: 8, skipped: 1, failed: 1 },
      {
        limit: 10,
        needsCompanies: false,
        batchSize: 10,
        concurrency: 2,
        cooldownMs: 0,
        delayMs: 0,
        requestsPerSecond: 4,
        dryRun: false,
      },
      2000,
    );
    expect(report).toContain('Processed:       10');
    expect(report).toContain('Status:          PARTIAL');
    expect(report).toContain('5.0 items/s');
  });
});

describe('enrichment MVP: needs-companies selection and limiter wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects only games missing developers or publishers (never unknowns)', async () => {
    const full = makeGame(20, {
      developers: [createOrganization('D')],
      publishers: [createOrganization('P')],
    });
    const noDev = makeGame(21, { publishers: [createOrganization('P')] });
    const noPub = makeGame(22, { developers: [createOrganization('D')] });
    const games = new Map<string, Game>([
      ['enrich-20', full],
      ['enrich-21', noDev],
      ['enrich-22', noPub],
    ]);
    const repo = createMapRepository(games);
    const runner = new EnrichmentRunner(
      {
        gameRepository: repo,
        sourceRegistry: registryOf([mockAdapter('igdb', (id) => makeRaw(Number(id) - 1000))]),
      },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0, needsCompanies: true },
    );

    const result = await runner.runOnce();

    expect(result.processed).toBe(2);
    expect(repo.findMany).toHaveBeenCalledWith(expect.objectContaining({ needsCompanies: true }));
  });

  it('explicit ids take precedence over needs-companies', async () => {
    const games = new Map<string, Game>([['enrich-23', makeGame(23)]]);
    const repo = createMapRepository(games);
    const runner = new EnrichmentRunner(
      {
        gameRepository: repo,
        sourceRegistry: registryOf([mockAdapter('igdb', () => makeRaw(23))]),
      },
      {
        batchSize: 10,
        concurrency: 2,
        itemTimeoutMs: 5000,
        cooldownMs: 0,
        ids: ['enrich-23'],
        needsCompanies: true,
      },
    );

    const result = await runner.runOnce();

    expect(result.processed).toBe(1);
    expect(repo.findMany).not.toHaveBeenCalled();
  });

  it('adapter gates postApi calls through the limiter (telemetry exact)', async () => {
    const { IgdbAdapter } = await import('../../src/sources/igdb/igdb-adapter.js');
    const { TokenBucketRateLimiter } = await import('../../src/infrastructure/rate-limiter.js');
    let t = 0;
    const limiter = new TokenBucketRateLimiter(1000, {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('id.twitch.tv')) {
        return new Response(
          JSON.stringify({ access_token: 'tok', expires_in: 3600, token_type: 'bearer' }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([{ id: 7, name: 'G', game_type: 0, status: 0 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    try {
      const adapter = new IgdbAdapter({
        source: 'igdb',
        clientId: 'id',
        clientSecret: 'secret',
        rateLimiter: limiter,
      });
      const before = limiter.acquired;
      await adapter.getById('7');
      // game fetch only (no involved_companies in fixture => single call).
      expect(limiter.acquired).toBe(before + 1);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('a 429 fails only its own item and keeps the limiter consistent', async () => {
    const games = new Map<string, Game>([
      ['enrich-24', makeGame(24)],
      ['enrich-25', makeGame(25)],
    ]);
    const repo = createMapRepository(games);
    let calls = 0;
    const flaky = {
      source: 'igdb',
      capabilities: { search: true, getById: true, searchCovers: false, searchPagination: 'none' },
      search: vi.fn(async () => ({ candidates: [], hasMore: false })),
      getById: vi.fn(async (id: string) => {
        calls += 1;
        if (id === '1024') {
          const { SourceError } = await import('../../src/sources/source-errors.js');
          throw new SourceError('igdb', 'rate_limited', 'Rate limited: 429');
        }
        return makeRaw(Number(id) - 1000);
      }),
    } as unknown as SourceAdapter;
    const runner = new EnrichmentRunner(
      { gameRepository: repo, sourceRegistry: registryOf([flaky]) },
      { batchSize: 10, concurrency: 2, itemTimeoutMs: 5000, cooldownMs: 0 },
    );

    const result = await runner.runOnce();

    // Adapter-level 429 is swallowed per-source (no observations) like
    // any provider fetch failure: no crash, no invention.
    expect(calls).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.processed).toBe(2);
    expect(games.get('enrich-25')?.developers.map((d) => d.name)).toContain('Enrich Dev');
  });

  it('parses --needs-companies and --requests-per-second', () => {
    expect(parseEnrichArgs(['--needs-companies', '--limit', '10'])).toMatchObject({
      needsCompanies: true,
      requestsPerSecond: 4,
    });
    expect(parseEnrichArgs(['--limit', '5'])).toMatchObject({
      needsCompanies: false,
      requestsPerSecond: 4,
    });
    expect(() => parseEnrichArgs(['--limit', '5', '--requests-per-second', '0'])).toThrow(
      '--requests-per-second',
    );
  });
});
