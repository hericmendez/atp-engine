import { Router, type Request, type Response, type NextFunction } from 'express';
import type { CatalogService } from '../../../application/catalog-service.js';
import { AdminGamesQuerySchema, GameIdParamSchema } from '../validation/schemas.js';
import { toAdminGameResponse, toPaginatedResponse } from '../types/api.js';
import type { GameQuery, GameSortField } from '../../../domain/game/game-repository.js';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';

export interface AdminGamesReadRouterDependencies {
  catalogService: CatalogService;
}

export function adminGamesReadRouter(deps: AdminGamesReadRouterDependencies): Router {
  const router = Router();

  router.use(adminAuthMiddleware);

  // GET /games — admin read-only list with operational filters
  router.get('/games', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = AdminGamesQuerySchema.parse(req.query);

      const gameQuery: GameQuery = {
        search: query.search,
        title: query.title,
        platform: query.platform,
        platforms: query.platforms,
        platformFamily: query.platformFamily,
        developer: query.developer,
        developers: query.developers,
        publisher: query.publisher,
        publishers: query.publishers,
        genre: query.genre,
        genres: query.genres,
        classification: query.classification,
        completeness: query.completeness,
        hasCover: query.hasCover,
        hasDescription: query.hasDescription,
        hasDevelopers: query.hasDevelopers,
        hasPublishers: query.hasPublishers,
        needsCover: query.needsCover,
        needsCompanies: query.needsCompanies,
        releaseYear: query.releaseYear,
        releaseYearFrom: query.releaseYearFrom,
        releaseYearTo: query.releaseYearTo,
        page: query.page,
        limit: query.limit,
        sort: query.sort ? { field: query.sort as GameSortField, direction: query.order } : undefined,
      };

      const result = await deps.catalogService.listGames(gameQuery);

      res.json({
        ...toPaginatedResponse(result.data, toAdminGameResponse),
        origin: result.origin,
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /games/:id — admin detail
  router.get('/games/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = GameIdParamSchema.parse(req.params);
      const result = await deps.catalogService.getGameById(id);
      res.json({
        data: toAdminGameResponse(result.data),
        origin: result.origin,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
