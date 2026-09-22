import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IGDB_PLATFORM_ALLOWLIST,
  allowlistedPlatformsInSyncOrder,
  findAllowlistedPlatform,
  isAllowedPlatformId,
} from '../../src/sync/igdb-platform-allowlist.js';
import {
  resolveScopePlatform,
  validateAllowlist,
  formatValidationReport,
} from '../../src/scripts/sync-igdb.js';
import type { IgdbAdapter } from '../../src/sources/igdb/igdb-adapter.js';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/game/game.js';
import { EnrichmentService } from '../../src/application/enrichment-service.js';
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
import { QuarantineService } from '../../src/application/quarantine-service.js';
import type { PlatformCatalogRepository } from '../../src/domain/platform/platform-catalog-repository.js';
import type { DiscoveryEngine, DiscoveryResult } from '../../src/discovery/discovery-engine.js';
import type { CatalogSource } from '../../src/sources/catalog-source.js';
import type { RawCandidate } from '../../src/sources/raw-candidate.js';
import type { CatalogSyncStateRepository } from '../../src/application/catalog-sync-state-repository.js';
import type { CatalogSyncState } from '../../src/application/catalog-sync-state-types.js';

describe('IGDB platform allowlist config', () => {
  it('contains the 94 curated rows as provided', () => {
    expect(IGDB_PLATFORM_ALLOWLIST).toHaveLength(94);
  });

  it('every entry with an ID also records the IGDB name; ID-less entries are MISSING/AMBIGUOUS', () => {
    for (const entry of IGDB_PLATFORM_ALLOWLIST) {
      if (entry.igdbId !== null) {
        expect(typeof entry.igdbName).toBe('string');
      } else {
        expect(['MISSING', 'AMBIGUOUS']).toContain(entry.status);
        expect(entry.igdbName).toBeNull();
      }
    }
    const withId = IGDB_PLATFORM_ALLOWLIST.filter((p) => p.igdbId !== null);
    expect(withId).toHaveLength(71);
    expect(IGDB_PLATFORM_ALLOWLIST.filter((p) => p.status === 'MISSING')).toHaveLength(21);
  });

  it('Neo Geo resolves to MVS (79) with a documented caveat; PICO/PC Booter stay ID-less', () => {
    const neoGeo = findAllowlistedPlatform('Neo Geo');
    expect(neoGeo?.igdbId).toBe(79);
    expect(neoGeo?.status).toBe('AMBIGUOUS');
    expect(neoGeo?.note).toContain('AES');
    expect(findAllowlistedPlatform('PICO')?.igdbId).toBeNull();
    expect(findAllowlistedPlatform('PC Booter')?.igdbId).toBeNull();
  });

  it('looks up curated names case-insensitively and trims whitespace', () => {
    expect(findAllowlistedPlatform('  windows  ')?.igdbId).toBe(6);
    expect(findAllowlistedPlatform('psp')?.igdbId).toBe(38);
    expect(findAllowlistedPlatform('No Such Platform')).toBeUndefined();
  });

  it('allows only verified IDs (DUPLICATE Stadia 203 stays out)', () => {
    expect(isAllowedPlatformId(6)).toBe(true);
    expect(isAllowedPlatformId(79)).toBe(true);
    expect(isAllowedPlatformId(203)).toBe(false);
    expect(isAllowedPlatformId(999999)).toBe(false);
  });

  it('sync order is deterministic: only with-ID entries, ascending curatedCount', () => {
    const order = allowlistedPlatformsInSyncOrder();
    expect(order).toHaveLength(71);
    expect(order[0]?.curatedName).toBe('Neo Geo Pocket');
    expect(order[order.length - 1]?.curatedName).toBe('Windows');
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]?.curatedCount).toBeGreaterThanOrEqual(order[i - 1]?.curatedCount as number);
      expect(order[i]?.igdbId).not.toBeNull();
    }
    // Recomputed order is stable across calls.
    expect(allowlistedPlatformsInSyncOrder().map((p) => p.igdbId)).toEqual(
      order.map((p) => p.igdbId),
    );
  });
});

describe('resolveScopePlatform allowlist enforcement', () => {
  it('accepts allowlisted IDs and names', () => {
    expect(
      resolveScopePlatform({
        mode: 'single',
        platformId: 6,
        pageSize: 10,
        dryRun: true,
        delayMs: 0,
      }),
    ).toEqual({ igdbId: 6, label: 'Windows' });
    expect(
      resolveScopePlatform({
        mode: 'single',
        curatedName: 'nintendo switch',
        pageSize: 10,
        dryRun: true,
        delayMs: 0,
      }),
    ).toEqual({ igdbId: 130, label: 'Nintendo Switch' });
  });

  it('rejects IDs and names outside the allowlist with PLATFORM_NOT_ALLOWED', () => {
    expect(() =>
      resolveScopePlatform({
        mode: 'single',
        platformId: 999,
        pageSize: 10,
        dryRun: true,
        delayMs: 0,
      }),
    ).toThrow('PLATFORM_NOT_ALLOWED');
    expect(() =>
      resolveScopePlatform({
        mode: 'single',
        platformId: 203,
        pageSize: 10,
        dryRun: true,
        delayMs: 0,
      }),
    ).toThrow('PLATFORM_NOT_ALLOWED');
    expect(() =>
      resolveScopePlatform({
        mode: 'single',
        curatedName: 'Solaris',
        pageSize: 10,
        dryRun: true,
        delayMs: 0,
      }),
    ).toThrow('PLATFORM_NOT_ALLOWED');
    expect(() =>
      resolveScopePlatform({
        mode: 'single',
        curatedName: 'PICO',
        pageSize: 10,
        dryRun: true,
        delayMs: 0,
      }),
    ).toThrow('PLATFORM_NOT_ALLOWED');
    expect(() =>
      resolveScopePlatform({
        mode: 'single',
        curatedName: 'Made Up Console',
        pageSize: 10,
        dryRun: true,
        delayMs: 0,
      }),
    ).toThrow('PLATFORM_NOT_ALLOWED');
  });
});

describe('validateAllowlist is read-only and reports mismatches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function stubSource(nameFor: (id: number) => string | null, count: number) {
    return {
      getPlatformInfo: vi.fn(async (id: number) => {
        const name = nameFor(id);
        return name === null ? null : { id, name };
      }),
      countByPlatform: vi.fn(async () => count),
      enumerateByPlatform: vi.fn(async () => ({ items: [] })),
    } as unknown as IgdbAdapter;
  }

  it('resolves ID entries live and never touches the database', async () => {
    const source = stubSource(
      (id) => IGDB_PLATFORM_ALLOWLIST.find((p) => p.igdbId === id)?.igdbName ?? null,
      100,
    );
    const rows = await validateAllowlist(source);

    expect(rows).toHaveLength(94);
    // One info + count + enumerate probe per with-ID entry; nothing for ID-less ones.
    expect(source.getPlatformInfo).toHaveBeenCalledTimes(71);
    const resolved = rows.filter((r) => r.igdbId !== null && r.error === null);
    expect(resolved.length).toBeGreaterThan(0);
    const missing = rows.filter((r) => r.igdbId === null);
    expect(missing).toHaveLength(23);
    expect(missing.every((r) => r.igdbCount === null)).toBe(true);
  });

  it('flags live renames as NAME_MISMATCH and unresolvable IDs as ERROR', async () => {
    const source = stubSource((id) => (id === 6 ? 'PC (Renamed)' : 'ok'), 100);
    // Override: return recorded names except PC, and null for one ID.
    source.getPlatformInfo = vi.fn(async (id: number) => {
      if (id === 7) return null;
      const recorded = IGDB_PLATFORM_ALLOWLIST.find((p) => p.igdbId === id)?.igdbName ?? 'ok';
      return { id, name: id === 6 ? 'PC (Renamed)' : recorded };
    });
    const rows = await validateAllowlist(source as unknown as IgdbAdapter);

    const pc = rows.find((r) => r.igdbId === 6);
    expect(pc?.status).toBe('NAME_MISMATCH');
    expect(pc?.error).toContain('PC (Renamed)');
    const ps = rows.find((r) => r.igdbId === 7);
    expect(ps?.status).toBe('ERROR');
    const report = formatValidationReport(rows);
    expect(report).toContain('Name mismatches:');
    expect(report).toContain('PC (Renamed)');
    expect(report).toContain('Status:     BLOCKED');
  });

  it('reports READY when everything resolves, with top count deltas', async () => {
    const source = stubSource(
      (id) => IGDB_PLATFORM_ALLOWLIST.find((p) => p.igdbId === id)?.igdbName ?? null,
      100,
    );
    const rows = await validateAllowlist(source);
    const report = formatValidationReport(rows);

    expect(report).toContain('Configured: 94');
    expect(report).toContain('Status:     READY');
    expect(report).toContain('Counts (curated -> IGDB live, top deltas):');
  });
});

describe('multi-platform resume and cross-platform dedup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRaw(n: number): RawCandidate {
    const id = `shared-${n}`;
    return {
      source: 'igdb',
      sourceId: id,
      title: `Shared Game ${n}`,
      platforms: ['PC'],
      developers: ['Test Dev'],
      publishers: ['Test Pub'],
      genres: ['action'],
      releaseDate: '2020-01-15',
      description: 'A cross-platform candidate',
      coverUrls: [],
      externalIdentifiers: [{ source: 'igdb', id }],
      gameType: 'main_game',
      gameStatus: 'released',
      classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'test' }],
    };
  }

  function setup() {
    const games = new Map<string, Game>();
    const gameRepository: GameRepository = {
      findById: vi.fn(async (id: GameId) => [...games.values()].find((g) => g.id === id) ?? null),
      findByExternalIdentifier: vi.fn(
        async ({ source, externalId }: { source: string; externalId: string }) =>
          games.get(`${source}:${externalId}`) ?? null,
      ),
      existsByExternalIdentifier: vi.fn(async () => false),
      existsById: vi.fn(async () => false),
      findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
      save: vi.fn(async (game: Game) => {
        for (const ext of game.externalIdentifiers) {
          games.set(`${ext.source}:${ext.id}`, game);
        }
      }),
      update: vi.fn(async (game: Game) => {
        for (const ext of game.externalIdentifiers) {
          games.set(`${ext.source}:${ext.id}`, game);
        }
      }),
      deleteById: vi.fn(async () => {}),
    };
    const rows = new Map<string, CatalogSyncState>();
    const states: CatalogSyncStateRepository = {
      upsert: vi.fn(async (state) => {
        const row = { ...state, updatedAt: new Date().toISOString() } as CatalogSyncState;
        rows.set(`${row.source}|${row.scopeType}|${row.scopeId}`, row);
        return row;
      }),
      findByScope: vi.fn(async (source: string, scopeType: string, scopeId: string) => {
        const row = rows.get(`${source}|${scopeType}|${scopeId}`);
        return row ? { ...row } : null;
      }),
      findBySource: vi.fn(async () => []),
    };
    const service = new CatalogSyncService({
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
      quarantineService: new QuarantineService({
        quarantineRepository: {
          record: vi.fn(async () => {}),
          findByGroupId: vi.fn(async () => null),
          count: vi.fn(async () => 0),
        },
      }),
      classifier: new DeterministicClassifier(),
    });
    return { service, states, games, rows };
  }

  it('same IGDB game enumerated under two platforms persists once (atp-igdb-{id})', async () => {
    const { service, states, games } = setup();
    // Same 3 IGDB IDs visible from both platform scopes.
    const shared: CatalogSource = {
      source: 'igdb',
      enumerateByPlatform: vi.fn(
        async (_platformId: number, opts: { limit: number; offset: number }) => ({
          items: [0, 1, 2].slice(opts.offset, opts.offset + opts.limit).map((n) => makeRaw(n)),
        }),
      ),
      countByPlatform: vi.fn(async () => 3),
    };

    const first = await service.ingestEnumerationResumable(shared, 6, { pageSize: 10 }, states);
    const second = await service.ingestEnumerationResumable(shared, 48, { pageSize: 10 }, states);

    expect(first.newGames).toBe(3);
    expect(games.size).toBe(3);
    // Second platform finds the same canonical records: no duplicates.
    expect(second.newGames).toBe(0);
    expect(games.size).toBe(3);
    for (const game of games.values()) {
      expect(game.id.startsWith('atp-igdb-')).toBe(true);
    }
  });

  it('initialOffset slices a fresh scope; stored checkpoints win on resume', async () => {
    const { service, states } = setup();
    const source: CatalogSource = {
      source: 'igdb',
      enumerateByPlatform: vi.fn(
        async (_platformId: number, opts: { limit: number; offset: number }) => ({
          items: Array.from(
            { length: Math.max(0, Math.min(opts.limit, 20 - opts.offset)) },
            (_, i) => makeRaw(opts.offset + i),
          ),
        }),
      ),
      countByPlatform: vi.fn(async () => 20),
    };

    const sliced = await service.ingestEnumerationResumable(
      source,
      6,
      { pageSize: 10, initialOffset: 14, limit: 6 },
      states,
    );
    expect(sliced.processed).toBe(6);
    expect(sliced.nextOffset).toBe(20);

    // A stored checkpoint always wins over a conflicting initialOffset.
    const resumed = await service.ingestEnumerationResumable(
      source,
      6,
      { pageSize: 10, initialOffset: 0 },
      states,
    );
    expect(resumed.nextOffset).toBe(20);
    expect(resumed.status).toBe('COMPLETED');
  });
});
