import { Router, type Request, type Response, type NextFunction } from 'express';
import type { CoverService } from '../../../application/cover-service.js';
import { GameIdParamSchema, CoverSearchQuerySchema } from '../validation/schemas.js';
import type { RankedCoverCandidate } from '../../../domain/cover/cover-candidate.js';

export interface CoverRouterDependencies {
  coverService: CoverService;
}

function serializeCandidate(rc: RankedCoverCandidate) {
  return {
    url: rc.candidate.url,
    source: rc.candidate.source,
    sourceId: rc.candidate.sourceId,
    width: rc.candidate.width,
    height: rc.candidate.height,
    type: rc.candidate.type,
    ranking: rc.ranking,
  };
}

export function coverRouter(deps: CoverRouterDependencies): Router {
  const router = Router();
  const { coverService } = deps;

  router.get('/covers/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { q, source } = CoverSearchQuerySchema.parse(req.query);
      const sourceFilter = source ? [source] : undefined;
      const result = await coverService.searchCovers(q, { sourceFilter });

      res.json({
        data: {
          query: result.query,
          selected: result.selected,
          candidates: result.candidates.map(serializeCandidate),
          errors: result.errors,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/games/:id/cover', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = GameIdParamSchema.parse(req.params);
      const result = await coverService.getGameCover(id);

      res.json({
        data: {
          gameId: result.gameId,
          query: result.query,
          selected: result.selected,
          candidates: result.candidates.map(serializeCandidate),
          errors: result.errors,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
