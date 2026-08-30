import express from 'express';
import { healthRouter } from './routes/health.js';
import { gamesRouter, type GamesRouterDependencies } from './routes/games.js';
import { coverRouter, type CoverRouterDependencies } from './routes/cover.js';
import { errorHandler } from './middleware/error-handler.js';
import { NotFoundError } from '../../shared/errors/errors.js';

export interface AppDependencies {
  games: GamesRouterDependencies;
  cover: CoverRouterDependencies;
}

export function createApp(deps: AppDependencies): express.Express {
  const app = express();

  app.use(express.json());
  app.use(healthRouter());

  const apiV1 = express.Router();
  apiV1.use(gamesRouter(deps.games));
  apiV1.use(coverRouter(deps.cover));
  app.use('/api/v1', apiV1);

  app.use((_req, _res, next) => {
    next(new NotFoundError());
  });

  app.use(errorHandler);

  return app;
}
