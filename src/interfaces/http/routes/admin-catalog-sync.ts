import { Router, type Request, type Response, type NextFunction } from 'express';
import type { CatalogSyncService } from '../../../application/catalog-sync-service.js';
import { CatalogSyncRequestSchema } from '../validation/schemas.js';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';

export interface AdminCatalogSyncRouterDependencies {
  catalogSyncService: CatalogSyncService;
}

export function adminCatalogSyncRouter(deps: AdminCatalogSyncRouterDependencies): Router {
  const router = Router();
  const { catalogSyncService } = deps;

  router.use(adminAuthMiddleware);

  router.post('/catalog/sync', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = CatalogSyncRequestSchema.parse(req.body);

      const result = await catalogSyncService.sync({
        platforms: body.platforms,
        activeOnly: body.activeOnly,
        from: body.from,
        to: body.to,
        dryRun: body.dryRun,
        trigger: 'manual',
      });

      res.json({
        data: result,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
