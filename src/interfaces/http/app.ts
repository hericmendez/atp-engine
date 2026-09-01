import express from 'express';
import { healthRouter } from './routes/health.js';
import { gamesRouter, type GamesRouterDependencies } from './routes/games.js';
import { coverRouter, type CoverRouterDependencies } from './routes/cover.js';
import { platformRouter, type PlatformRouterDependencies } from './routes/platforms.js';
import { catalogSyncRouter, type CatalogSyncRouterDependencies } from './routes/catalog-sync.js';
import {
  catalogSyncHistoryRouter,
  type CatalogSyncHistoryRouterDependencies,
} from './routes/catalog-sync-history.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requestLoggerMiddleware } from './middleware/request-logger.js';
import { requestTimeoutMiddleware } from './middleware/request-timeout.js';
import { rateLimiterMiddleware } from './middleware/rate-limiter.js';
import { NotFoundError } from '../../shared/errors/errors.js';

export interface AppDependencies {
  games: GamesRouterDependencies;
  cover: CoverRouterDependencies;
  platforms: PlatformRouterDependencies;
  catalogSync: CatalogSyncRouterDependencies;
  catalogSyncHistory: CatalogSyncHistoryRouterDependencies;
}

export function createApp(deps: AppDependencies): express.Express {
  const app = express();

  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(requestTimeoutMiddleware({ timeoutMs: 30000 }));
  app.use(rateLimiterMiddleware({ windowMs: 60000, maxRequests: 100 }));
  app.use(healthRouter());

  const apiV1 = express.Router();
  apiV1.use(gamesRouter(deps.games));
  apiV1.use(coverRouter(deps.cover));
  apiV1.use(platformRouter(deps.platforms));
  apiV1.use(catalogSyncRouter(deps.catalogSync));
  apiV1.use(catalogSyncHistoryRouter(deps.catalogSyncHistory));
  app.use('/api/v1', apiV1);

  app.use((_req, _res, next) => {
    next(new NotFoundError());
  });

  app.use(errorHandler);

  return app;
}
