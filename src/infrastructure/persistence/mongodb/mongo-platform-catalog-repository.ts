import type {
  PlatformCatalogRepository,
  PlatformCatalogQuery,
  PaginatedPlatformResult,
  PlatformCatalogEntryWithGameCount,
} from '../../../domain/platform/platform-catalog-repository.js';
import type { PlatformCatalogEntry } from '../../../domain/platform/platform-catalog.js';
import { PlatformCatalogModel } from './platform-catalog-schema.js';
import { GameModel } from './game-schema.js';
import { PersistenceError } from '../../../shared/errors/errors.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface MongoFilter {
  [key: string]: unknown;
}

export class MongoPlatformCatalogRepository implements PlatformCatalogRepository {
  async findMany(query: PlatformCatalogQuery): Promise<PaginatedPlatformResult> {
    try {
      const filter = this.buildFilter(query);
      const page = query.page ?? DEFAULT_PAGE;
      const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

      // showEmpty === false (explicit) hides empties; undefined/true shows all.
      // Via HTTP, absent query param transforms to false (hide), so default hides.
      // Direct repo calls with {} keep undefined → show all (preserves seed regression).
      const hideEmpty = query.showEmpty === false;
      const needsGameCountSort = query.sort?.field === 'gameCount';

      // When gameCount is needed for sorting/filtering, DB-level pagination is
      // incorrect because gameCount is computed after the query. Fetch all
      // matching docs, enrich, then filter/sort/paginate in memory. Platforms
      // collection is small (few hundred), so this is correct and cheap.
      // For other sorts we keep DB pagination.
      const needsPostEnrichmentHandling = hideEmpty || needsGameCountSort;

      if (needsPostEnrichmentHandling) {
        const sortForFetch = needsGameCountSort ? ({ name: 1 } as Record<string, 1 | -1>) : this.buildSort(query.sort);
        const allDocs = await PlatformCatalogModel.find(filter).sort(sortForFetch as never).lean();
        let items = await this.enrichWithGameCounts(allDocs);

        if (hideEmpty) {
          items = items.filter((p) => p.gameCount > 0);
        }

        if (needsGameCountSort) {
          const dir = query.sort!.direction === 'desc' ? -1 : 1;
          items.sort((a, b) => {
            const diff = dir * (a.gameCount - b.gameCount);
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name);
          });
        }

        const total = items.length;
        const skip = (page - 1) * limit;
        const paginated = items.slice(skip, skip + limit);

        return {
          items: paginated,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        };
      }

      const sort = this.buildSort(query.sort);
      const skip = (page - 1) * limit;

      const [docs, total] = await Promise.all([
        PlatformCatalogModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
        PlatformCatalogModel.countDocuments(filter),
      ]);

      const items = await this.enrichWithGameCounts(docs);

      // showEmpty===true is already correct (DB pagination ok because no post-filter).
      // For safety, if showEmpty became true after conditional, we are here only when showEmpty===true and no gameCount sort.
      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new PersistenceError('Failed to find platform catalog entries', { cause: error });
    }
  }

  async findById(id: string): Promise<PlatformCatalogEntryWithGameCount | null> {
    try {
      const doc = await PlatformCatalogModel.findOne({ platformId: id }).lean();
      if (!doc) return null;

      const gameCount = await this.countGamesForPlatform(doc.name);
      return this.toEntryWithGameCount(doc, gameCount);
    } catch (error) {
      throw new PersistenceError('Failed to find platform catalog entry by ID', { cause: error });
    }
  }

  async findByCompany(company: string): Promise<readonly PlatformCatalogEntryWithGameCount[]> {
    try {
      const docs = await PlatformCatalogModel.find({
        company: { $regex: company, $options: 'i' },
      })
        .sort({ releaseYear: 1 })
        .lean();

      return this.enrichWithGameCounts(docs);
    } catch (error) {
      throw new PersistenceError('Failed to find platform catalog entries by company', {
        cause: error,
      });
    }
  }

  async upsert(entry: PlatformCatalogEntry): Promise<void> {
    try {
      await PlatformCatalogModel.findOneAndUpdate(
        { platformId: entry.id },
        {
          $set: {
            platformId: entry.id,
            name: entry.name,
            company: entry.company,
            releaseYear: entry.releaseYear,
            status: entry.status,
            family: entry.family,
            type: entry.type,
            thumb: entry.thumb,
          },
        },
        { upsert: true, runValidators: true },
      );
    } catch (error) {
      throw new PersistenceError('Failed to upsert platform catalog entry', { cause: error });
    }
  }

  async bulkUpsert(entries: readonly PlatformCatalogEntry[]): Promise<{ inserted: number; updated: number; errors: number }> {
    if (entries.length === 0) return { inserted: 0, updated: 0, errors: 0 };
    try {
      const ops = entries.map((entry) => ({
        updateOne: {
          filter: { platformId: entry.id },
          update: {
            $set: {
              platformId: entry.id,
              name: entry.name,
              company: entry.company,
              releaseYear: entry.releaseYear,
              status: entry.status,
              family: entry.family,
              type: entry.type,
              thumb: entry.thumb,
            },
          },
          upsert: true,
        },
      }));

      const result = await PlatformCatalogModel.bulkWrite(ops as never, { ordered: false });

      const inserted = (result as unknown as { upsertedCount: number }).upsertedCount ?? 0;
      const matched = (result as unknown as { matchedCount: number }).matchedCount ?? 0;
      // For idempotence, count matched as updated (even if not modified, original logic counted as updated when existing)
      const updated = matched;
      const errors = 0;
      return { inserted, updated, errors };
    } catch (error) {
      // BulkWriteError contains writeErrors
      const bulkError = error as { writeErrors?: unknown[]; result?: { nInserted?: number; nMatched?: number; nUpserted?: number } };
      if (bulkError.writeErrors) {
        const inserted = (bulkError.result?.nUpserted ?? 0) as number;
        const matched = (bulkError.result?.nMatched ?? 0) as number;
        return { inserted, updated: matched, errors: bulkError.writeErrors.length };
      }
      throw new PersistenceError('Failed to bulk upsert platform catalog entries', { cause: error });
    }
  }

  private buildFilter(query: PlatformCatalogQuery): MongoFilter {
    const filter: MongoFilter = {};

    if (query.companyName) {
      filter.company = { $regex: query.companyName, $options: 'i' };
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.releaseYear !== undefined) {
      filter.releaseYear = query.releaseYear;
    }

    if (query.releaseYearRange) {
      filter.releaseYear = {
        $gte: query.releaseYearRange.from,
        $lte: query.releaseYearRange.to,
      };
    }

    return filter;
  }

  private buildSort(sort: PlatformCatalogQuery['sort']): Record<string, 1 | -1> {
    if (!sort) {
      return { name: 1 };
    }

    const fieldMap: Record<string, string> = {
      name: 'name',
      releaseYear: 'releaseYear',
      gameCount: '_gameCount', // placeholder, sorted post-enrichment
    };

    const direction = sort.direction === 'asc' ? 1 : -1;
    const field = fieldMap[sort.field] ?? sort.field;

    // For gameCount, we need to sort after enrichment
    if (sort.field === 'gameCount') {
      return { name: 1 }; // default sort, will re-sort after enrichment
    }

    // Secondary tiebreaker must not collide with the primary key: when
    // sorting by name, `{ name: direction, name: 1 }` would silently
    // collapse to ascending and drop the requested direction.
    if (sort.field === 'name') {
      return { name: direction };
    }

    return { [field]: direction, name: 1 };
  }

  private async enrichWithGameCounts(
    docs: Array<{
      platformId: string;
      name: string;
      company: string;
      releaseYear: number | null;
      status: string;
      family: string | null;
      type: string | null;
      thumb: string | null;
    }>,
  ): Promise<PlatformCatalogEntryWithGameCount[]> {
    // Batch count games for all platforms
    const platformNames = docs.map((d) => d.name);
    const counts = await this.countGamesForPlatforms(platformNames);

    return docs.map((doc) => {
      const gameCount = counts.get(doc.name) ?? 0;
      return this.toEntryWithGameCount(doc, gameCount);
    });
  }

  private async countGamesForPlatforms(platformNames: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    if (platformNames.length === 0) return counts;

    const results = await GameModel.aggregate([
      { $unwind: '$releases' },
      { $match: { 'releases.platform.name': { $in: platformNames } } },
      { $group: { _id: '$releases.platform.name', count: { $sum: 1 } } },
    ]);

    for (const result of results) {
      counts.set(result._id, result.count);
    }

    return counts;
  }

  private async countGamesForPlatform(platformName: string): Promise<number> {
    const counts = await this.countGamesForPlatforms([platformName]);
    return counts.get(platformName) ?? 0;
  }

  private toEntryWithGameCount(
    doc: {
      platformId: string;
      name: string;
      company: string;
      releaseYear: number | null;
      status: string;
      family: string | null;
      type: string | null;
      thumb: string | null;
    },
    gameCount: number,
  ): PlatformCatalogEntryWithGameCount {
    return {
      id: doc.platformId,
      name: doc.name,
      company: doc.company,
      releaseYear: doc.releaseYear,
      status: doc.status as PlatformCatalogEntryWithGameCount['status'],
      family: doc.family as PlatformCatalogEntryWithGameCount['family'],
      type: doc.type as PlatformCatalogEntryWithGameCount['type'],
      thumb: doc.thumb,
      gameCount,
    };
  }
}
