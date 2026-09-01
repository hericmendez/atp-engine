import { Router, type Request, type Response, type NextFunction } from 'express';
import type { CatalogSyncService } from '../../../application/catalog-sync-service.js';
import { CatalogSyncRequestSchema } from '../validation/schemas.js';

export interface CatalogSyncRouterDependencies {
  catalogSyncService: CatalogSyncService;
}

export function catalogSyncRouter(deps: CatalogSyncRouterDependencies): Router {
  const router = Router();
  const { catalogSyncService } = deps;

  router.post('/catalog/sync', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = CatalogSyncRequestSchema.parse(req.body);

      const result = await catalogSyncService.sync({
        platforms: body.platforms,
        activeOnly: body.activeOnly,
        from: body.from,
        to: body.to,
        dryRun: body.dryRun,
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
