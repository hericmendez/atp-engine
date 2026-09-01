import { Router, type Request, type Response, type NextFunction } from 'express';
import type { GameAdminService } from '../../../application/game-admin-service.js';
import {
  GameIdParamSchema,
  CreateGameBodySchema,
  UpdateGameBodySchema,
} from '../validation/schemas.js';
import { toGameResponse } from '../types/api.js';

export interface AdminGamesRouterDependencies {
  gameAdminService: GameAdminService;
}

export function adminGamesRouter(deps: AdminGamesRouterDependencies): Router {
  const router = Router();
  const { gameAdminService } = deps;

  router.post('/admin/games', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = CreateGameBodySchema.parse(req.body);
      const game = await gameAdminService.createGame(body);
      res.status(201).json({ data: toGameResponse(game) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/admin/games/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = GameIdParamSchema.parse(req.params);
      const body = UpdateGameBodySchema.parse(req.body);
      const game = await gameAdminService.updateGame(id, body);
      res.json({ data: toGameResponse(game) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/admin/games/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = GameIdParamSchema.parse(req.params);
      await gameAdminService.deleteGame(id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
