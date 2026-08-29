import express from 'express';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/error-handler.js';
import { NotFoundError } from '../../shared/errors/errors.js';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json());
  app.use(healthRouter());

  app.use((_req, _res, next) => {
    next(new NotFoundError());
  });

  app.use(errorHandler);

  return app;
}
