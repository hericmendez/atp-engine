import { createApp } from './interfaces/http/app.js';
import { CatalogService } from './application/catalog-service.js';
import { CoverService } from './application/cover-service.js';
import { CoverEngine } from './cover/cover-engine.js';
import { MongoGameRepository } from './infrastructure/persistence/mongodb/mongo-game-repository.js';
import { SourceRegistry } from './sources/source-registry.js';
import { WikipediaAdapter } from './sources/wikipedia/wikipedia-adapter.js';
import { SteamAdapter } from './sources/steam/steam-adapter.js';
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
  const catalogService = new CatalogService({ gameRepository });

  const sourceRegistry = new SourceRegistry();
  sourceRegistry.register(
    new WikipediaAdapter({ source: 'wikipedia', baseUrl: 'https://en.wikipedia.org/w/api.php' }),
  );
  sourceRegistry.register(
    new SteamAdapter({ source: 'steam', baseUrl: 'https://store.steampowered.com/api' }),
  );

  const coverEngine = new CoverEngine({ sourceRegistry });
  const coverService = new CoverService({ gameRepository, coverEngine });

  const app = createApp({
    games: { catalogService },
    cover: { coverService },
  });

  const server = app.listen(config.PORT, () => {
    logger.info('ATP Engine started', {
      port: config.PORT,
      env: config.NODE_ENV,
    });
  });

  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
