import { Router, type Request, type Response, type NextFunction } from 'express';
import mongoose from 'mongoose';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import { getDatabaseStats } from '../../../application/database-stats-service.js';
import { AppError } from '../../../shared/errors/errors.js';

export function adminDatabaseStatsRouter(): Router {
  const router = Router();

  router.get('/database/stats', adminAuthMiddleware, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new AppError('DATABASE_STATS_ERROR', 'Database connection not available', 500);
      }
      const stats = await getDatabaseStats(db as unknown as Parameters<typeof getDatabaseStats>[0]);
      res.json({ data: stats });
    } catch (err) {
      if (err instanceof AppError) {
        next(err);
        return;
      }
      next(new AppError('DATABASE_STATS_ERROR', 'Failed to retrieve database stats', 500, { cause: err as Error }));
    }
  });

  return router;
}
