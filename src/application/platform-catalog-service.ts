import type {
  PlatformCatalogRepository,
  PlatformCatalogQuery,
  PaginatedPlatformResult,
  PlatformCatalogEntryWithGameCount,
} from '../domain/platform/platform-catalog-repository.js';
import { NotFoundError } from '../shared/errors/errors.js';
import type { DataOrigin } from './data-origin.js';

export interface PlatformCatalogServiceDependencies {
  platformCatalogRepository: PlatformCatalogRepository;
}

export interface PlatformCatalogResult<T> {
  readonly data: T;
  readonly origin: DataOrigin;
}

export interface PlatformStats {
  readonly total: number;
  readonly notEmpty: number;
  readonly empty: number;
  readonly byStatus: {
    readonly active: number;
    readonly inactive: number;
    readonly discontinued: number;
  };
}

export class PlatformCatalogService {
  private readonly platformCatalogRepository: PlatformCatalogRepository;

  constructor(deps: PlatformCatalogServiceDependencies) {
    this.platformCatalogRepository = deps.platformCatalogRepository;
  }

  async listPlatforms(
    query: PlatformCatalogQuery,
  ): Promise<PlatformCatalogResult<PaginatedPlatformResult>> {
    const result = await this.platformCatalogRepository.findMany(query);
    return { data: result, origin: 'database' };
  }

  async listPlatformsGrouped(
    query: PlatformCatalogQuery,
  ): Promise<PlatformCatalogResult<{ families: { name: string; platforms: PlatformCatalogEntryWithGameCount[] }[]; ungrouped: PlatformCatalogEntryWithGameCount[]; total: number }>> {
    // Load all platforms matching filters but ignoring pagination, sorted by name ASC for determinism
    const allQuery: PlatformCatalogQuery = {
      ...query,
      page: 1,
      limit: 200,
      sort: { field: 'name', direction: 'asc' },
    };
    const result = await this.platformCatalogRepository.findMany(allQuery);
    // If total > 200 (should not happen, 181), paginate further
    let items = [...result.items];
    let total = result.total;
    if (total > 200) {
      const second = await this.platformCatalogRepository.findMany({ ...allQuery, page: 2, limit: 200 });
      items = [...items, ...second.items];
    }
    // Group by family, preserve canonical name exactly, trim ?
    const familyMap = new Map<string, PlatformCatalogEntryWithGameCount[]>();
    const ungrouped: PlatformCatalogEntryWithGameCount[] = [];
    for (const p of items) {
      const fam = p.family;
      if (fam === null || fam === undefined || (typeof fam === 'string' && fam.trim() === '')) {
        ungrouped.push(p);
      } else {
        const key = fam;
        const existing = familyMap.get(key);
        if (existing) existing.push(p);
        else familyMap.set(key, [p]);
      }
    }
    const families = Array.from(familyMap.entries())
      .map(([name, platforms]) => ({
        name,
        platforms: [...platforms].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    ungrouped.sort((a, b) => a.name.localeCompare(b.name));
    return { data: { families, ungrouped, total }, origin: 'database' };
  }

  /**
   * Global catalog statistics, independent of listing filters/pagination.
   * Derived from the full Platform Catalog with per-platform gameCount.
   */
  async getPlatformStats(): Promise<PlatformCatalogResult<PlatformStats>> {
    // Paginate through the full catalog (repository caps limit at 100).
    const limit = 100;
    let page = 1;
    let items: PlatformCatalogEntryWithGameCount[] = [];
    let total = 0;
    do {
      const result = await this.platformCatalogRepository.findMany({
        page,
        limit,
        sort: { field: 'name', direction: 'asc' },
      });
      total = result.total;
      items = [...items, ...result.items];
      page += 1;
    } while (items.length < total);

    let notEmpty = 0;
    let active = 0;
    let inactive = 0;
    let discontinued = 0;
    for (const p of items) {
      if (p.gameCount > 0) notEmpty += 1;
      if (p.status === 'active') active += 1;
      else if (p.status === 'inactive') inactive += 1;
      else if (p.status === 'discontinued') discontinued += 1;
    }
    return {
      data: { total, notEmpty, empty: total - notEmpty, byStatus: { active, inactive, discontinued } },
      origin: 'database',
    };
  }

  async getPlatformById(
    id: string,
  ): Promise<PlatformCatalogResult<PlatformCatalogEntryWithGameCount>> {
    const platform = await this.platformCatalogRepository.findById(id);

    if (!platform) {
      throw new NotFoundError(`Platform with ID ${id} not found`);
    }

    return { data: platform, origin: 'database' };
  }
}
