import { Router, type Request, type Response, type NextFunction } from 'express';
import type { CatalogSyncHistoryRepository } from '../../../application/catalog-sync-history-repository.js';
import { CatalogSyncHistoryQuerySchema, SyncHistoryIdParamSchema } from '../validation/schemas.js';
import { NotFoundError } from '../../../shared/errors/errors.js';

export interface CatalogSyncHistoryRouterDependencies {
  historyRepository: CatalogSyncHistoryRepository;
}

export function catalogSyncHistoryRouter(deps: CatalogSyncHistoryRouterDependencies): Router {
  const router = Router();
  const { historyRepository } = deps;

  router.get('/catalog/sync/history', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = CatalogSyncHistoryQuerySchema.parse(req.query);

      const result = await historyRepository.findMany({
        status: query.status,
        trigger: query.trigger,
        platformId: query.platformId,
        from: query.from,
        to: query.to,
        page: query.page,
        limit: query.limit,
        sort: query.sort
          ? { field: query.sort, direction: query.order }
          : { field: 'startedAt', direction: 'desc' },
      });

      res.json({
        data: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    '/catalog/sync/history/:id',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = SyncHistoryIdParamSchema.parse(req.params);

        const record = await historyRepository.findById(id);

        if (!record) {
          throw new NotFoundError('Sync history record not found');
        }

        res.json({
          data: record,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
