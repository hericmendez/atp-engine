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
    // INSTRUMENTATION Fase 4.8-4.9
    const tSeedTotalStart = Date.now();
    logger.info('Platform seed started', { totalEntries: PLATFORM_SEED_DATA.length });

    const validEntries: ReturnType<typeof createPlatformCatalogEntry>[] = [];
    let validationErrors = 0;

    for (const entry of PLATFORM_SEED_DATA) {
      try {
        const catalogEntry = createPlatformCatalogEntry(entry);
        validEntries.push(catalogEntry);
      } catch (error) {
        validationErrors++;
        logger.error('Platform seed entry failed', {
          platformId: entry.id,
          name: entry.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Prefer bulk path if available, fallback to legacy loop for mocked repos
    const bulkRepo = this.platformCatalogRepository as unknown as { bulkUpsert?: (entries: readonly ReturnType<typeof createPlatformCatalogEntry>[]) => Promise<{ inserted: number; updated: number; errors: number }> };
    if (typeof bulkRepo.bulkUpsert === 'function') {
      try {
        const result = await bulkRepo.bulkUpsert(validEntries);
        const totalMs = Date.now() - tSeedTotalStart;
        logger.info('platform-seed instrumentation', {
          totalMs,
          maxIterMs: Math.round(totalMs / validEntries.length),
          slowCount: 0,
          avgMs: Math.round(totalMs / validEntries.length),
          mode: 'bulkWrite',
        });
        logger.info('Platform seed completed', { inserted: result.inserted, updated: result.updated, errors: result.errors + validationErrors });
        return { inserted: result.inserted, updated: result.updated, errors: result.errors + validationErrors };
      } catch (error) {
        logger.error('Platform seed bulk failed', { error: String(error) });
        // Fallback to per-entry for detailed error handling
      }
    }

    let inserted = 0;
    let updated = 0;
    let errors = validationErrors;
    for (const entry of validEntries) {
      try {
        const existing = await this.platformCatalogRepository.findById(entry.id);
        await this.platformCatalogRepository.upsert(entry);
        if (existing) updated++;
        else inserted++;
      } catch (e) {
        errors++;
        logger.error('Platform seed entry failed', {
          platformId: entry.id,
          name: entry.name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    logger.info('Platform seed completed', { inserted, updated, errors });
    return { inserted, updated, errors };
  }
}
