import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../../src/application/catalog-sync-service.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGame } from '../../src/domain/game/game.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
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

// ─── Fakes ───────────────────────────────────────────────────────

function makeRaw(n: number, overrides: Partial<RawCandidate> = {}): RawCandidate {
  const id = `qa-${n}`;
  return {
    source: 'igdb',
    sourceId: id,
    title: `QA Game ${n}`,
    platforms: ['PC'],
    developers: ['Test Dev'],
    publishers: ['Test Pub'],
    genres: ['action'],
    releaseDate: '2020-01-15',
    description: 'A quarantine accounting candidate',
    coverUrls: [],
    externalIdentifiers: [{ source: 'igdb', id }],
    gameType: 'main_game',
    gameStatus: 'released',
    classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'test' }],
    ...overrides,
  };
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

function createEmptyStates(): CatalogSyncStateRepository {
  return {
    upsert: vi.fn(
      async (state) => ({ ...state, updatedAt: new Date().toISOString() }) as CatalogSyncState,
    ),
    findByScope: vi.fn(async () => null),
    findBySource: vi.fn(async () => []),
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('quarantine accounting: every rejected item produces exactly one record', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejected counter equals quarantine record calls across all rejection paths', async () => {
    const items: RawCandidate[] = [
      makeRaw(1), // canonical -> persisted
      makeRaw(2, { gameType: 'dlc_addon' }), // POLICY_EXCLUDED (page loop)
      makeRaw(3, { classificationHints: [{ category: 'BOOK', confidence: 0.9, evidence: 't' }] }), // eligibility INELIGIBLE
      makeRaw(4, { externalIdentifiers: [] }), // MISSING_STABLE_IDENTITY
      makeRaw(5, { gameType: 'port', parentGameId: '424242' }), // UNRESOLVED_PORT_PARENT (second pass)
      makeRaw(6, { gameType: 'expansion' }), // POLICY_REVIEW
      makeRaw(7, { gameType: 'remake' }), // reclassification conflict vs seeded main_game
      makeRaw(8), // canonical -> persisted
    ];
    const source: CatalogSource = {
      source: 'igdb',
      enumerateByPlatform: vi.fn(async () => ({ items })),
      countByPlatform: vi.fn(async () => items.length),
    };

    const games = new Map<string, Game>();
    games.set(
      'igdb:qa-7',
      createGame({
        id: createGameId('atp-igdb-qa-7'),
        titles: [createGameTitle('QA Game 7', 'primary')],
        externalIdentifiers: [createExternalIdentifier('igdb', 'qa-7')],
        classification: 'GAME',
        completeness: 'FOUND_PARTIAL',
        gameType: 'main_game',
        gameStatus: 'released',
      }),
    );

    const records: unknown[] = [];
    const quarantineRepository: QuarantineRepository = {
      record: vi.fn(async (entry) => {
        records.push(entry);
      }),
      findByGroupId: vi.fn(async () => null),
      count: vi.fn(async () => records.length),
    };
    const service = new CatalogSyncService({
      gameRepository: createFakeGameRepository(games),
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
      enrichmentService: new EnrichmentService({ gameRepository: createFakeGameRepository(games) }),
      quarantineService: new QuarantineService({ quarantineRepository }),
      classifier: new DeterministicClassifier(),
    });

    const result = await service.ingestEnumerationResumable(
      source,
      48,
      { pageSize: 10 },
      createEmptyStates(),
    );

    // 2 canonical persisted, 6 rejected — one quarantine record each.
    expect(result.accepted).toBe(2);
    expect(result.quarantined).toBe(6);
    expect(records).toHaveLength(6);
    expect(quarantineRepository.record).toHaveBeenCalledTimes(6);
  });
});
