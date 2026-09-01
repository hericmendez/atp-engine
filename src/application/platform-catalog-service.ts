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
