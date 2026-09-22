// Must stay the first import: loads .env into process.env for the
// whole server process tree (config, adapters). tsx --env-file does
// not propagate to watch-mode children and NODE_OPTIONS forbids it,
// so explicit dotenv here is the only reliable mechanism. Scoped to
// this entrypoint on purpose: shared modules and tests must never
// depend on ambient .env files.
import 'dotenv/config';

import { createApp } from './interfaces/http/app.js';
import { CatalogService } from './application/catalog-service.js';
import { GameAdminService } from './application/game-admin-service.js';
import { CoverService } from './application/cover-service.js';
import { EnrichmentService } from './application/enrichment-service.js';
import { EnrichmentRunner } from './application/enrichment-runner.js';
import { CoverEnrichmentRunner } from './application/cover-enrichment-runner.js';
import { EnrichmentOrchestrator } from './application/enrichment-orchestrator.js';
import { CatalogSyncService } from './application/catalog-sync-service.js';
import { PlatformCatalogService } from './application/platform-catalog-service.js';
import { PlatformSeedService } from './application/platform-seed-service.js';
import { CoverEngine } from './cover/cover-engine.js';
import { MongoGameRepository } from './infrastructure/persistence/mongodb/mongo-game-repository.js';
import { MongoPlatformCatalogRepository } from './infrastructure/persistence/mongodb/mongo-platform-catalog-repository.js';
import { MongoCatalogSyncHistoryRepository } from './infrastructure/persistence/mongodb/mongo-catalog-sync-history-repository.js';
import { MongoQuarantineRepository } from './infrastructure/persistence/mongodb/mongo-quarantine-repository.js';
import { QuarantineService } from './application/quarantine-service.js';
import { SourceRegistry } from './sources/source-registry.js';
import { WikipediaAdapter } from './sources/wikipedia/wikipedia-adapter.js';
import { WikipediaCoverDiscovery } from './sources/wikipedia/cover/wikipedia-cover-discovery.js';
import { SteamAdapter } from './sources/steam/steam-adapter.js';
import { IgdbAdapter } from './sources/igdb/igdb-adapter.js';
import { DiscoveryEngine } from './discovery/discovery-engine.js';
import { DeterministicClassifier } from './classification/deterministic-classifier.js';
import { DeterministicIdentityResolver } from './identity/deterministic-identity-resolver.js';
import { IntervalEnrichmentScheduler } from './infrastructure/enrichment-scheduler.js';
import { IntervalCatalogSyncScheduler } from './infrastructure/catalog-sync-scheduler.js';
import { MongoEnrichmentJobRepository } from './infrastructure/persistence/mongodb/mongo-enrichment-job-repository.js';
import { MongoCatalogSyncLockRepository } from './infrastructure/persistence/mongodb/mongo-catalog-sync-lock-repository.js';
import { loadConfig } from './infrastructure/config/config.js';
import { logger } from './infrastructure/logger/logger.js';
import { setLogLevel } from './infrastructure/logger/logger.js';
import {
  connectDatabase,
  disconnectDatabase,
} from './infrastructure/persistence/mongodb/connection.js';

async function main(): Promise<void> {
  // INSTRUMENTATION Fase 4.8 — timing
  const tMainStart = Date.now();
  logger.info('startup.main.start', { timestamp: new Date().toISOString() });

  const tLoadConfigStart = Date.now();
  const config = loadConfig();
  logger.info('startup.loadConfig.completed', { durationMs: Date.now() - tLoadConfigStart });

  setLogLevel(config.LOG_LEVEL);

  const tConnectStart = Date.now();
  logger.info('startup.connectDatabase.start', { timestamp: new Date().toISOString() });
  await connectDatabase();
  logger.info('startup.connectDatabase.completed', { durationMs: Date.now() - tConnectStart, totalMs: Date.now() - tMainStart });

  const gameRepository = new MongoGameRepository();
  const platformCatalogRepository = new MongoPlatformCatalogRepository();
  const catalogSyncHistoryRepository = new MongoCatalogSyncHistoryRepository();

  const platformSeedService = new PlatformSeedService({ platformCatalogRepository });
  const tSeedStart = Date.now();
  logger.info('startup.platformSeed.start', { timestamp: new Date().toISOString() });
  try {
    const seedResult = await platformSeedService.seed();
    logger.info('startup.platformSeed.completed', { durationMs: Date.now() - tSeedStart, totalMs: Date.now() - tMainStart, result: seedResult });
    logger.info('Platform seed result', seedResult);
  } catch (error) {
    logger.info('startup.platformSeed.failed', { durationMs: Date.now() - tSeedStart });
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

  const quarantineService = new QuarantineService({
    quarantineRepository: new MongoQuarantineRepository(),
  });

  const catalogService = new CatalogService({
    gameRepository,
    discoveryEngine,
    enrichmentService,
    quarantineService,
  });

  const wikipediaCoverDiscovery = new WikipediaCoverDiscovery();
  const coverEngine = new CoverEngine({ sourceRegistry, wikipediaCoverDiscovery });
  const coverService = new CoverService({ gameRepository, coverEngine });

  const gameAdminService = new GameAdminService({ gameRepository });

  const platformCatalogService = new PlatformCatalogService({ platformCatalogRepository });

  const catalogSyncLockRepository = new MongoCatalogSyncLockRepository();

  const catalogSyncService = new CatalogSyncService({
    gameRepository,
    platformCatalogRepository,
    discoveryEngine,
    enrichmentService,
    historyRepository: catalogSyncHistoryRepository,
    quarantineService,
    classifier,
    lockRepository: catalogSyncLockRepository,
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

  const enrichmentJobRepository = new MongoEnrichmentJobRepository();
  const coverEnrichmentRunner = new CoverEnrichmentRunner(gameRepository, coverService, enrichmentJobRepository);
  // Description enrichment reuses same adapters but via DescriptionEnrichmentService
  const { DescriptionEnrichmentService } = await import('./application/description-enrichment-service.js');
  const { DescriptionEnrichmentRunner } = await import('./application/description-enrichment-runner.js');
  const descriptionService = new DescriptionEnrichmentService({
    igdbAdapter: sourceRegistry.get('igdb') as unknown as import('./sources/igdb/igdb-adapter.js').IgdbAdapter | undefined,
    steamAdapter: sourceRegistry.get('steam') as unknown as import('./sources/steam/steam-adapter.js').SteamAdapter | undefined,
    wikipediaAdapter: sourceRegistry.get('wikipedia') as unknown as import('./sources/wikipedia/wikipedia-adapter.js').WikipediaAdapter | undefined,
  });
  const descriptionEnrichmentRunner = new DescriptionEnrichmentRunner(gameRepository, descriptionService, enrichmentJobRepository);
  const { CompanyEnrichmentService } = await import('./application/company-enrichment-service.js');
  const { CompanyEnrichmentRunner } = await import('./application/company-enrichment-runner.js');
  const companyService = new CompanyEnrichmentService({
    igdbAdapter: sourceRegistry.get('igdb') as unknown as import('./sources/igdb/igdb-adapter.js').IgdbAdapter | undefined,
  });
  const companyEnrichmentRunner = new CompanyEnrichmentRunner(gameRepository, companyService, enrichmentJobRepository);
  const enrichmentOrchestrator = new EnrichmentOrchestrator(enrichmentJobRepository, coverEnrichmentRunner, descriptionEnrichmentRunner, companyEnrichmentRunner);

  const tCreateAppStart = Date.now();
  logger.info('startup.createApp.start', { timestamp: new Date().toISOString() });
  const app = createApp({
    games: { catalogService },
    cover: { coverService },
    platforms: { platformCatalogService },
    catalogSync: { catalogSyncService },
    catalogSyncHistory: { historyRepository: catalogSyncHistoryRepository },
    admin: { gameAdminService },
    enrichmentJobs: { jobRepository: enrichmentJobRepository },
    adminEnrichmentJobs: { jobRepository: enrichmentJobRepository, orchestrator: enrichmentOrchestrator },
    adminGamesRead: { catalogService },
    adminCatalogSync: { catalogSyncService },
  });
  logger.info('startup.createApp.completed', { durationMs: Date.now() - tCreateAppStart, totalMs: Date.now() - tMainStart });

  const tListenStart = Date.now();
  logger.info('startup.listen.start', { timestamp: new Date().toISOString(), port: config.PORT });
  const server = app.listen(config.PORT, () => {
    logger.info('startup.listen.callback', { durationMs: Date.now() - tListenStart, totalMs: Date.now() - tMainStart });
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
