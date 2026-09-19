import { describe, it, expect, vi } from 'vitest';
import { CatalogService } from '../../src/application/catalog-service.js';
import { QuarantineService } from '../../src/application/quarantine-service.js';
import type { QuarantineRepository } from '../../src/application/quarantine-repository.js';
import type { QuarantinedCandidate } from '../../src/application/quarantine-types.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { DiscoveryEngine } from '../../src/discovery/discovery-engine.js';
import type { DiscoveryGroupResult } from '../../src/discovery/discovery-types.js';
import type { ClassificationCategory } from '../../src/domain/shared/classification-category.js';
import { EnrichmentService } from '../../src/application/enrichment-service.js';

class MemoryQuarantineRepository implements QuarantineRepository {
  readonly records = new Map<string, QuarantinedCandidate>();

  async record(entry: QuarantinedCandidate): Promise<void> {
    this.records.set(entry.groupId, entry);
  }

  async findByGroupId(groupId: string): Promise<QuarantinedCandidate | null> {
    return this.records.get(groupId) ?? null;
  }

  async count(): Promise<number> {
    return this.records.size;
  }
}

function makeGroup(overrides: {
  groupId?: string;
  category?: ClassificationCategory;
  classificationConfidence?: number;
  identityConfidence?: number;
  title?: string;
}): DiscoveryGroupResult {
  const title = overrides.title ?? 'Test Game';
  return {
    groupId: overrides.groupId ?? 'group-1',
    observations: [
      {
        source: 'wikipedia',
        sourceId: 'wp-1',
        candidate: {
          titles: [{ value: title, type: 'primary' as const }],
          developers: [],
          publishers: [],
          genres: [],
          releases: [],
          externalIdentifiers: [{ source: 'wikipedia', id: 'wp-1' }],
          provenance: {
            source: 'wikipedia',
            sourceId: 'wp-1',
            retrievedAt: new Date().toISOString(),
            rawTitle: title,
          },
          classificationHints: [],
          description: null,
          coverUrls: [],
        },
        classification: {
          category: overrides.category ?? 'GAME',
          confidence: overrides.classificationConfidence ?? 0.9,
          signals: [],
          reason: 'test',
        },
        retrievedAt: new Date().toISOString(),
      },
    ],
    mergedClassification: {
      category: overrides.category ?? 'GAME',
      confidence: overrides.classificationConfidence ?? 0.9,
      signals: [],
      reason: 'test',
    },
    identityResolution: {
      outcome: 'SAME_GAME' as const,
      relationship: null,
      confidence: overrides.identityConfidence ?? 0.9,
      signals: [],
      reason: 'test',
      method: 'NATIVE' as const,
    },
    rankingScore: 0.8,
    rankingBreakdown: {
      identityConfidence: overrides.identityConfidence ?? 0.9,
      classificationConfidence: overrides.classificationConfidence ?? 0.9,
      sourceCount: 1,
      metadataCompleteness: 0.7,
      titleRelevance: 0.8,
    },
  };
}

function makeGameRepository(): GameRepository & { saved: Game[] } {
  const saved: Game[] = [];
  return {
    saved,
    findById: async () => null,
    findByExternalIdentifier: async () => null,
    existsByExternalIdentifier: async () => false,
    existsById: async () => false,
    findMany: async (query) => ({
      items: [],
      total: 0,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      totalPages: 0,
    }),
    save: async (game) => {
      saved.push(game);
    },
    update: async () => {},
    deleteById: async () => {},
  };
}

function makeDiscoveryEngine(groups: DiscoveryGroupResult[]): DiscoveryEngine {
  return {
    discover: vi.fn().mockResolvedValue({
      query: '',
      groups,
      totalGroups: groups.length,
      sourceErrors: [],
      hasMore: false,
    }),
  } as unknown as DiscoveryEngine;
}

describe('QuarantineService', () => {
  it('records rejected hardware candidates with debugging context', async () => {
    const repo = new MemoryQuarantineRepository();
    const service = new QuarantineService({ quarantineRepository: repo });
    const group = makeGroup({ groupId: 'g-hw', category: 'HARDWARE' });

    const { catalogEligibility } = await import(
      '../../src/eligibility/catalog-eligibility.js'
    );
    await service.recordRejection(group, catalogEligibility(group));

    const stored = await repo.findByGroupId('g-hw');
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('INELIGIBLE');
    expect(stored?.source).toBe('wikipedia');
    expect(stored?.classification).toBe('HARDWARE');
    expect(stored?.titles).toContain('Test Game');
  });

  it('overwrites repeated rejections of the same group instead of duplicating', async () => {
    const repo = new MemoryQuarantineRepository();
    const service = new QuarantineService({ quarantineRepository: repo });
    const { catalogEligibility } = await import(
      '../../src/eligibility/catalog-eligibility.js'
    );
    const group = makeGroup({ groupId: 'g-dup', category: 'HARDWARE' });

    await service.recordRejection(group, catalogEligibility(group));
    await service.recordRejection(group, catalogEligibility(group));

    expect(await repo.count()).toBe(1);
  });

  it('never records eligible groups', async () => {
    const repo = new MemoryQuarantineRepository();
    const service = new QuarantineService({ quarantineRepository: repo });
    const { catalogEligibility } = await import(
      '../../src/eligibility/catalog-eligibility.js'
    );
    const group = makeGroup({ groupId: 'g-ok' });

    await service.recordRejection(group, catalogEligibility(group));

    expect(await repo.count()).toBe(0);
  });
});

describe('search persistence quarantine integration', () => {
  it('records rejections and persists nothing on explicit discovery', async () => {
    const repo = makeGameRepository();
    const quarantine = new MemoryQuarantineRepository();
    const service = new CatalogService({
      gameRepository: repo,
      discoveryEngine: makeDiscoveryEngine([
        makeGroup({ groupId: 'g-hw', category: 'HARDWARE' }),
      ]),
      quarantineService: new QuarantineService({
        quarantineRepository: quarantine,
      }),
    });

    const result = await service.searchGames('Doom', { discover: true });

    expect(result.data.items).toHaveLength(0);
    expect(repo.saved).toHaveLength(0);
    expect(await quarantine.count()).toBe(1);
  });

  it('does not touch quarantine for accepted groups', async () => {
    const repo = makeGameRepository();
    const quarantine = new MemoryQuarantineRepository();
    const enrichment = new EnrichmentService({ gameRepository: repo });
    const service = new CatalogService({
      gameRepository: repo,
      discoveryEngine: makeDiscoveryEngine([makeGroup({ groupId: 'g-ok' })]),
      enrichmentService: enrichment,
      quarantineService: new QuarantineService({
        quarantineRepository: quarantine,
      }),
    });

    const result = await service.searchGames('Doom', { discover: true });

    expect(result.data.items).toHaveLength(1);
    expect(await quarantine.count()).toBe(0);
  });
});
