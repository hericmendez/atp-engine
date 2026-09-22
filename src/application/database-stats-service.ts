import { AppError } from '../shared/errors/errors.js';

type Db = {
  command: (cmd: Record<string, unknown>) => Promise<Record<string, unknown>>;
  listCollections: () => { toArray: () => Promise<{ name: string }[]> };
};

export interface CollectionStat {
  readonly name: string;
  readonly count: number;
  readonly size: number;
  readonly storageSize: number;
  readonly totalIndexSize: number;
}

export interface DatabaseStats {
  readonly dataSize: number;
  readonly storageSize: number;
  readonly indexSize: number;
  readonly totalSize: number;
  readonly objects: number;
  readonly collections: number;
  readonly avgObjSize: number;
  readonly collectionsStats: readonly CollectionStat[];
}

export async function getDatabaseStats(db: Db): Promise<DatabaseStats> {
  if (!db) {
    throw new AppError('DATABASE_STATS_ERROR', 'Database connection not available', 500);
  }

  let dbStats: Record<string, unknown>;
  try {
    dbStats = (await db.command({ dbStats: 1, scale: 1 })) as Record<string, unknown>;
  } catch (err) {
    throw new AppError('DATABASE_STATS_ERROR', 'Failed to retrieve database stats', 500, { cause: err as Error });
  }

  const dataSize = toNumber(dbStats['dataSize']);
  const storageSize = toNumber(dbStats['storageSize']);
  const indexSize = toNumber(dbStats['indexSize']);
  const objects = toNumber(dbStats['objects']);
  const collections = toNumber(dbStats['collections']);
  const avgObjSize = toNumber(dbStats['avgObjSize']);
  const totalSize = dataSize + indexSize;

  let collectionsStats: CollectionStat[] = [];
  try {
    const list = await db.listCollections().toArray();
    const names = list.map((c: { name: string }) => c.name).filter((n: string) => typeof n === 'string' && !n.startsWith('system.'));
    const stats = await Promise.all(
      names.map(async (name: string) => {
        try {
          const cs = (await db.command({ collStats: name, scale: 1 })) as Record<string, unknown>;
          return {
            name,
            count: toNumber(cs['count']),
            size: toNumber(cs['size']),
            storageSize: toNumber(cs['storageSize']),
            totalIndexSize: toNumber(cs['totalIndexSize']),
          } as CollectionStat;
        } catch {
          return {
            name,
            count: 0,
            size: 0,
            storageSize: 0,
            totalIndexSize: 0,
          } as CollectionStat;
        }
      }),
    );
    collectionsStats = stats;
  } catch {
    // if listCollections fails, return empty collectionsStats but keep dbStats
    collectionsStats = [];
  }

  return {
    dataSize,
    storageSize,
    indexSize,
    totalSize,
    objects,
    collections,
    avgObjSize,
    collectionsStats,
  };
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
