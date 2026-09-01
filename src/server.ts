import { createApp } from './interfaces/http/app.js';
import { CatalogService } from './application/catalog-service.js';
import { CoverService } from './application/cover-service.js';
import { EnrichmentService } from './application/enrichment-service.js';
import { EnrichmentRunner } from './application/enrichment-runner.js';
import { CatalogSyncService } from './application/catalog-sync-service.js';
import { PlatformCatalogService } from './application/platform-catalog-service.js';
import { PlatformSeedService } from './application/platform-seed-service.js';
import { CoverEngine } from './cover/cover-engine.js';
import { MongoGameRepository } from './infrastructure/persistence/mongodb/mongo-game-repository.js';
import { MongoPlatformCatalogRepository } from './infrastructure/persistence/mongodb/mongo-platform-catalog-repository.js';
import { MongoCatalogSyncHistoryRepository } from './infrastructure/persistence/mongodb/mongo-catalog-sync-history-repository.js';
import { SourceRegistry } from './sources/source-registry.js';
import { WikipediaAdapter } from './sources/wikipedia/wikipedia-adapter.js';
import { SteamAdapter } from './sources/steam/steam-adapter.js';
import { IgdbAdapter } from './sources/igdb/igdb-adapter.js';
import { DiscoveryEngine } from './discovery/discovery-engine.js';
import { DeterministicClassifier } from './classification/deterministic-classifier.js';
import { DeterministicIdentityResolver } from './identity/deterministic-identity-resolver.js';
import { IntervalEnrichmentScheduler } from './infrastructure/enrichment-scheduler.js';
import { IntervalCatalogSyncScheduler } from './infrastructure/catalog-sync-scheduler.js';
import { loadConfig } from './infrastructure/config/config.js';
import { logger } from './infrastructure/logger/logger.js';
import { setLogLevel } from './infrastructure/logger/logger.js';
import {
  connectDatabase,
  disconnectDatabase,
} from './infrastructure/persistence/mongodb/connection.js';

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.LOG_LEVEL);

  await connectDatabase();

  const gameRepository = new MongoGameRepository();
  const platformCatalogRepository = new MongoPlatformCatalogRepository();
  const catalogSyncHistoryRepository = new MongoCatalogSyncHistoryRepository();

  const platformSeedService = new PlatformSeedService({ platformCatalogRepository });
  try {
    const seedResult = await platformSeedService.seed();
    logger.info('Platform seed result', seedResult);
  } catch (error) {
    logger.error('Platform seed failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const sourceRegistry = new SourceRegistry();
  sourceRegistry.register(
    new WikipediaAdapter({ source: 'wikipedia', baseUrl: 'https://en.wikipedia.org/w/api.php' }),
  );
  sourceRegistry.register(
    new SteamAdapter({ source: 'steam', baseUrl: 'https://store.steampowered.com/api' }),
  );

  if (config.IGDB_CLIENT_ID && config.IGDB_CLIENT_SECRET) {
    sourceRegistry.register(
      new IgdbAdapter({
        source: 'igdb',
        clientId: config.IGDB_CLIENT_ID,
        clientSecret: config.IGDB_CLIENT_SECRET,
      }),
    );
    logger.info('IGDB adapter registered');
  } else {
    logger.info('IGDB adapter not registered (missing IGDB_CLIENT_ID or IGDB_CLIENT_SECRET)');
  }

  const classifier = new DeterministicClassifier();
  const identityResolver = new DeterministicIdentityResolver();
  const discoveryEngine = new DiscoveryEngine(sourceRegistry, classifier, identityResolver);

  const enrichmentService = new EnrichmentService({ gameRepository });

  const catalogService = new CatalogService({
    gameRepository,
    discoveryEngine,
    enrichmentService,
  });

  const coverEngine = new CoverEngine({ sourceRegistry });
  const coverService = new CoverService({ gameRepository, coverEngine });

  const platformCatalogService = new PlatformCatalogService({ platformCatalogRepository });

  const catalogSyncService = new CatalogSyncService({
    gameRepository,
    platformCatalogRepository,
    discoveryEngine,
    enrichmentService,
    historyRepository: catalogSyncHistoryRepository,
  });

  const enrichmentRunner = new EnrichmentRunner(
    { gameRepository, sourceRegistry },
    { batchSize: 10, concurrency: 2, itemTimeoutMs: 15_000, cooldownMs: 60_000 },
  );

  const enrichmentScheduler = new IntervalEnrichmentScheduler(enrichmentRunner, {
    intervalMs: 300_000,
  });

  const catalogSyncScheduler = new IntervalCatalogSyncScheduler(
    { catalogSyncService },
    {
      intervalMs: config.CATALOG_SYNC_INTERVAL_MS,
      lookbackDays: config.CATALOG_SYNC_LOOKBACK_DAYS,
      enabled: config.CATALOG_SYNC_ENABLED,
    },
  );

  const app = createApp({
    games: { catalogService },
    cover: { coverService },
    platforms: { platformCatalogService },
    catalogSync: { catalogSyncService },
    catalogSyncHistory: { historyRepository: catalogSyncHistoryRepository },
  });

  const server = app.listen(config.PORT, () => {
    logger.info('ATP Engine started', {
      port: config.PORT,
      env: config.NODE_ENV,
    });

    try {
      enrichmentScheduler.start();
      logger.info('Enrichment scheduler started', { intervalMs: 300_000 });
    } catch (error) {
      logger.error('Failed to start enrichment scheduler', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      catalogSyncScheduler.start();
    } catch (error) {
      logger.error('Failed to start catalog sync scheduler', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    await catalogSyncScheduler.stop();
    await enrichmentScheduler.stop();
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
