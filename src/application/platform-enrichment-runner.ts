import type { PlatformCatalogRepository } from '../domain/platform/platform-catalog-repository.js';
import type { PlatformEnrichmentService } from './platform-enrichment-service.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface PlatformEnrichmentRunnerResult {
  readonly total: number;
  readonly alreadyThumbed: number;
  readonly processed: number;
  readonly igdb: number;
  readonly wikipedia: number;
  readonly notFound: number;
  readonly errors: number;
  readonly durationMs: number;
}

export class PlatformEnrichmentRunner {
  constructor(
    private readonly platformRepository: PlatformCatalogRepository,
    private readonly enrichmentService: PlatformEnrichmentService,
  ) {}

  async run(): Promise<PlatformEnrichmentRunnerResult> {
    const start = Date.now();
    // Count directly from DB for accurate thumb stats (not via findMany which enriches gameCount)
    const { PlatformCatalogModel } = await import('../infrastructure/persistence/mongodb/platform-catalog-schema.js');
    const total = await PlatformCatalogModel.countDocuments({});
    const alreadyThumbed = await PlatformCatalogModel.countDocuments({ thumb: { $ne: null } });
    // Find platforms needing enrichment (null or partial)
    const needing = await PlatformCatalogModel.find({
      $or: [{ thumb: null }, { 'thumb.logo': null }, { 'thumb.image': null }],
    }).lean();
    let processed = 0;
    let igdb = 0;
    let wikipedia = 0;
    let notFound = 0;
    let errors = 0;

    // Process in batches of 10 to respect rate limit 4 req/s
    const batchSize = 10;
    for (let i = 0; i < needing.length; i += batchSize) {
      const batch = needing.slice(i, i + batchSize);
      // Process sequentially within batch to avoid 181 concurrent requests
      for (const doc of batch) {
        try {
          const platform = {
            id: doc.platformId,
            name: doc.name,
            company: doc.company,
            releaseYear: doc.releaseYear,
            status: doc.status,
            family: doc.family,
            type: doc.type,
            thumb: doc.thumb as unknown as import('../domain/platform/platform-catalog.js').PlatformThumb | null,
          } as import('../domain/platform/platform-catalog.js').PlatformCatalogEntry;
          // Skip if already complete (both logo and image)
          if (platform.thumb?.logo && platform.thumb?.image) {
            continue;
          }
          const result = await this.enrichmentService.enrich(platform);
          processed += 1;
          if (result.status === 'FOUND_COMPLETE' || result.status === 'FOUND_PARTIAL') {
            const hasLogo = !!result.logo;
            const hasImage = !!result.image;
            if (hasLogo) igdb += 1;
            if (hasImage) wikipedia += 1;
            if (!hasLogo && !hasImage) {
              notFound += 1;
            } else {
              // Merge with existing thumb
              const existing = platform.thumb ?? { logo: null, image: null };
              const merged = {
                logo: result.logo ?? existing.logo ?? null,
                image: result.image ?? existing.image ?? null,
              };
              // Normalize empty object to null
              const thumb = merged.logo || merged.image ? merged : null;
              await this.platformRepository.upsert({ ...platform, thumb } as import('../domain/platform/platform-catalog.js').PlatformCatalogEntry);
            }
          } else {
            notFound += 1;
          }
          // Respect rate limit 4 req/s -> 250ms per request
          await new Promise((r) => setTimeout(r, 250));
        } catch (err) {
          errors += 1;
          processed += 1;
          logger.warn('platform.enrich.failed', { platform: (batch[0] as unknown as { name: string }).name, error: String(err) });
        }
      }
    }

    return {
      total,
      alreadyThumbed,
      processed,
      igdb,
      wikipedia,
      notFound,
      errors,
      durationMs: Date.now() - start,
    };
  }
}
