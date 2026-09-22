import { describe, it, expect, vi } from 'vitest';
import { getDatabaseStats } from '../src/application/database-stats-service.js';

function createMockDb(overrides: {
  dbStats?: Record<string, unknown>;
  collections?: string[];
  collStats?: Record<string, Record<string, unknown>>;
  dbStatsError?: Error;
}) {
  const dbStats = overrides.dbStats ?? { dataSize: 12345678, storageSize: 14500000, indexSize: 2345678, objects: 196449, collections: 8, avgObjSize: 62 };
  const collections = overrides.collections ?? ['games', 'platformcatalogs'];
  const collStats = overrides.collStats ?? {
    games: { count: 196449, size: 12000000, storageSize: 14000000, totalIndexSize: 2000000 },
    platformcatalogs: { count: 181, size: 50000, storageSize: 60000, totalIndexSize: 10000 },
  };
  return {
    command: vi.fn(async (cmd: Record<string, unknown>) => {
      if ('dbStats' in cmd) {
        if (overrides.dbStatsError) throw overrides.dbStatsError;
        return dbStats;
      }
      if ('collStats' in cmd) {
        const name = cmd['collStats'] as string;
        if (collStats[name]) return collStats[name];
        return { count: 0, size: 0, storageSize: 0, totalIndexSize: 0 };
      }
      throw new Error('unknown command');
    }),
    listCollections: vi.fn(() => ({
      toArray: async () => collections.map((name) => ({ name })),
    })),
  } as unknown as import('mongodb').Db;
}

describe('database-stats-service', () => {
  it('dbStats normal returns normalized', async () => {
    const db = createMockDb({});
    const stats = await getDatabaseStats(db);
    expect(stats.dataSize).toBe(12345678);
    expect(stats.storageSize).toBe(14500000);
    expect(stats.indexSize).toBe(2345678);
    expect(stats.totalSize).toBe(12345678 + 2345678);
    expect(stats.objects).toBe(196449);
    expect(stats.collections).toBe(8);
    expect(stats.avgObjSize).toBe(62);
    expect(stats.collectionsStats).toHaveLength(2);
  });

  it('collections stats per collection', async () => {
    const db = createMockDb({});
    const stats = await getDatabaseStats(db);
    const games = stats.collectionsStats.find((c) => c.name === 'games')!;
    expect(games.count).toBe(196449);
    expect(games.size).toBe(12000000);
    expect(games.storageSize).toBe(14000000);
    expect(games.totalIndexSize).toBe(2000000);
  });

  it('calculates totalSize as dataSize + indexSize', async () => {
    const db = createMockDb({ dbStats: { dataSize: 1000, storageSize: 2000, indexSize: 300, objects: 10, collections: 2, avgObjSize: 100 } });
    const stats = await getDatabaseStats(db);
    expect(stats.totalSize).toBe(1300);
  });

  it('database vazio returns zeros', async () => {
    const db = createMockDb({ dbStats: { dataSize: 0, storageSize: 0, indexSize: 0, objects: 0, collections: 0, avgObjSize: 0 }, collections: [] });
    const stats = await getDatabaseStats(db);
    expect(stats.dataSize).toBe(0);
    expect(stats.objects).toBe(0);
    expect(stats.collectionsStats).toHaveLength(0);
  });

  it('erro do comando Mongo throws', async () => {
    const db = createMockDb({ dbStatsError: new Error('mongo failure') });
    await expect(getDatabaseStats(db)).rejects.toThrow('Failed to retrieve database stats');
  });

  it('multiplas collections', async () => {
    const db = createMockDb({ collections: ['a', 'b', 'c'] });
    const stats = await getDatabaseStats(db);
    expect(stats.collectionsStats).toHaveLength(3);
  });

  it('nenhuma collection', async () => {
    const db = createMockDb({ collections: [] });
    const stats = await getDatabaseStats(db);
    expect(stats.collectionsStats).toEqual([]);
  });

  it('valores grandes', async () => {
    const big = 5 * 1024 * 1024 * 1024; // 5GB
    const db = createMockDb({ dbStats: { dataSize: big, storageSize: big + 1000, indexSize: 500000000, objects: 1000000, collections: 10, avgObjSize: 5000 } });
    const stats = await getDatabaseStats(db);
    expect(stats.dataSize).toBe(big);
    expect(stats.totalSize).toBe(big + 500000000);
  });

  it('handles missing fields as 0', async () => {
    const db = createMockDb({ dbStats: {} });
    const stats = await getDatabaseStats(db);
    expect(stats.dataSize).toBe(0);
    expect(stats.totalSize).toBe(0);
  });
});
