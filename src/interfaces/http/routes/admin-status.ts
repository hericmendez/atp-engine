import { Router, type Request, type Response } from 'express';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import { isDatabaseConnected } from '../../../infrastructure/persistence/mongodb/connection.js';

export function adminStatusRouter(): Router {
  const router = Router();

  router.get('/status', adminAuthMiddleware, (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      admin: true,
      database: isDatabaseConnected() ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
