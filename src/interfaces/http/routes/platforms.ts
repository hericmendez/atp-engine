import { Router, type Request, type Response, type NextFunction } from 'express';
import type { PlatformCatalogService } from '../../../application/platform-catalog-service.js';
import { PlatformCatalogQuerySchema, PlatformIdParamSchema } from '../validation/schemas.js';
import type { PlatformCatalogQuery } from '../../../domain/platform/platform-catalog-repository.js';

export interface PlatformRouterDependencies {
  platformCatalogService: PlatformCatalogService;
}

function serializePlatform(entry: {
  id: string;
  name: string;
  company: string;
  releaseYear: number | null;
  status: string;
  family: string | null;
  type: string | null;
  thumb: string | null;
  gameCount: number;
}) {
  return {
    id: entry.id,
    name: entry.name,
    company: entry.company,
    releaseYear: entry.releaseYear,
    status: entry.status,
    family: entry.family,
    type: entry.type,
    thumb: entry.thumb,
    gameCount: entry.gameCount,
  };
}

export function platformRouter(deps: PlatformRouterDependencies): Router {
  const router = Router();
  const { platformCatalogService } = deps;

  router.get('/platforms/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = PlatformCatalogQuerySchema.parse(req.query);

      const platformQuery: PlatformCatalogQuery = {
        companyName: query.companyName,
        status: query.platformStatus,
        releaseYear: query.releaseYear,
        releaseYearRange: query.releaseYearRange,
        showEmpty: query.showEmptyPlatforms,
        page: query.page,
        limit: query.limit,
        sort: query.sort ? { field: query.sort, direction: query.order } : undefined,
      };

      const result = await platformCatalogService.listPlatforms(platformQuery);

      res.json({
        data: result.data.items.map(serializePlatform),
        pagination: {
          page: result.data.page,
          limit: result.data.limit,
          total: result.data.total,
          totalPages: result.data.totalPages,
        },
        origin: result.origin,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/platforms/:platformId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { platformId } = PlatformIdParamSchema.parse(req.params);
      const result = await platformCatalogService.getPlatformById(platformId);

      res.json({
        data: serializePlatform(result.data),
        origin: result.origin,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
