import { Router, type Request, type Response, type NextFunction } from 'express';
import type { CatalogService } from '../../../application/catalog-service.js';
import { CatalogQuerySchema, SearchQuerySchema, GameIdParamSchema } from '../validation/schemas.js';
import { toGameResponse, toPaginatedResponse } from '../types/api.js';
import type { GameQuery, GameSort, GameSortField } from '../../../domain/game/game-repository.js';

export interface GamesRouterDependencies {
  catalogService: CatalogService;
}

export function gamesRouter(deps: GamesRouterDependencies): Router {
  const router = Router();
  const { catalogService } = deps;

  router.get('/games/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = SearchQuerySchema.parse(req.query);

      const sort: GameSort | undefined = query.sort
        ? { field: query.sort as GameSortField, direction: query.order }
        : undefined;

      const result = await catalogService.searchGames(query.q, {
        page: query.page,
        limit: query.limit,
        sort,
      });

      res.json({
        ...toPaginatedResponse(result.data, toGameResponse),
        origin: result.origin,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/games/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = GameIdParamSchema.parse(req.params);
      const result = await catalogService.getGameById(id);

      res.json({
        data: toGameResponse(result.data),
        origin: result.origin,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/games', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = CatalogQuerySchema.parse(req.query);

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
        releaseYear: query.releaseYear,
        releaseYearFrom: query.releaseYearFrom,
        releaseYearTo: query.releaseYearTo,
        page: query.page,
        limit: query.limit,
        sort: query.sort
          ? { field: query.sort as GameSortField, direction: query.order }
          : undefined,
      };

      const result = await catalogService.listGames(gameQuery);

      res.json({
        ...toPaginatedResponse(result.data, toGameResponse),
        origin: result.origin,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
