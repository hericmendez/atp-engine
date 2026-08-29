import { createApp } from './interfaces/http/app.js';
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

  const app = createApp();

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
