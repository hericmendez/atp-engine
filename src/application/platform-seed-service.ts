import type { PlatformCatalogRepository } from '../domain/platform/platform-catalog-repository.js';
import { createPlatformCatalogEntry } from '../domain/platform/platform-catalog.js';
import { PLATFORM_SEED_DATA } from '../platform-catalog/platforms-seed-data.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface PlatformSeedServiceDependencies {
  platformCatalogRepository: PlatformCatalogRepository;
}

export class PlatformSeedService {
  private readonly platformCatalogRepository: PlatformCatalogRepository;

  constructor(deps: PlatformSeedServiceDependencies) {
    this.platformCatalogRepository = deps.platformCatalogRepository;
  }

  async seed(): Promise<{ inserted: number; updated: number; errors: number }> {
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    logger.info('Platform seed started', { totalEntries: PLATFORM_SEED_DATA.length });

    for (const entry of PLATFORM_SEED_DATA) {
      try {
        const catalogEntry = createPlatformCatalogEntry(entry);
        const existing = await this.platformCatalogRepository.findById(catalogEntry.id);
        await this.platformCatalogRepository.upsert(catalogEntry);

        if (existing) {
          updated++;
        } else {
          inserted++;
        }
      } catch (error) {
        errors++;
        logger.error('Platform seed entry failed', {
          platformId: entry.id,
          name: entry.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Platform seed completed', { inserted, updated, errors });
    return { inserted, updated, errors };
  }
}
