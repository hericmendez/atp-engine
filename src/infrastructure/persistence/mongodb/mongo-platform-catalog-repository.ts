import type {
  PlatformCatalogRepository,
  PlatformCatalogQuery,
  PaginatedPlatformResult,
  PlatformCatalogEntryWithGameCount,
} from '../../../domain/platform/platform-catalog-repository.js';
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
      const skip = (page - 1) * limit;

      const sort = this.buildSort(query.sort);

      const [docs, total] = await Promise.all([
        PlatformCatalogModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
        PlatformCatalogModel.countDocuments(filter),
      ]);

      const items = await this.enrichWithGameCounts(docs);

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

    if (query.showEmpty === false) {
      // We'll filter this after game count enrichment
      // For now, mark it for post-processing
      filter._needsGameCountFilter = true;
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
