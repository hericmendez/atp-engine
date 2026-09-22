import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  EnrichmentJobListQuerySchema,
  EnrichmentJobIdParamSchema,
  EnrichmentJobCreateBodySchema,
} from '../validation/schemas.js';
import type { EnrichmentJobRepository } from '../../../domain/enrichment-job/enrichment-job-repository.js';
import { toEnrichmentJobDto } from '../../../application/enrichment-job-presenter.js';
import { NotFoundError, ConflictError } from '../../../shared/errors/errors.js';
import { adminAuthMiddleware } from '../middleware/admin-auth.js';
import type { EnrichmentOrchestrator } from '../../../application/enrichment-orchestrator.js';

export interface AdminEnrichmentJobsRouterDependencies {
  jobRepository: EnrichmentJobRepository;
  orchestrator?: EnrichmentOrchestrator;
}

export function adminEnrichmentJobsRouter(
  deps: AdminEnrichmentJobsRouterDependencies,
): Router {
  const router = Router();
  const { jobRepository } = deps;

  // All enrichment admin routes require admin authentication
  router.use(adminAuthMiddleware);

  // POST /enrichment/jobs — create and start cover enrichment
  router.post('/enrichment/jobs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = EnrichmentJobCreateBodySchema.parse(req.body);
      if (!deps.orchestrator) {
        // Fallback for tests without orchestrator: use direct repository create for backward compat
        const { AppError } = await import('../../../shared/errors/errors.js');
        throw new AppError('NOT_IMPLEMENTED', 'Enrichment orchestrator not configured', 500);
      }
      const job = await deps.orchestrator.createAndStart({
        type: body.type,
        limit: body.limit,
        batchSize: body.batchSize,
      });
      res.status(201).json({ data: toEnrichmentJobDto(job) });
    } catch (error) {
      next(error);
    }
  });

  // GET /enrichment/jobs?type=cover&status=RUNNING&limit=20&page=1&sort=updatedAt&order=desc
  router.get('/enrichment/jobs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, status, limit, page, sort, order } = EnrichmentJobListQuerySchema.parse(req.query);

      // Use paginated path if available (supports page/sort), fallback to legacy for mocks
      const paginated = jobRepository as unknown as {
        findPaginated?: (q: unknown) => Promise<{ items: import('../../../domain/enrichment-job/enrichment-job.js').EnrichmentJob[]; total: number; page: number; limit: number; totalPages: number }>;
      };
      if (typeof paginated.findPaginated === 'function') {
        const result = await paginated.findPaginated({ type, status, page, limit, sort, order });
        const data = result.items.map((j) => toEnrichmentJobDto(j));
        res.json({ data, pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
        return;
      }

      let jobs;
      if (type) {
        jobs = await jobRepository.findRecentByType(type, limit);
        if (status) jobs = jobs.filter((j) => j.status === status);
      } else if (status) {
        const all = await jobRepository.findRecent(limit * 3);
        jobs = all.filter((j) => j.status === status).slice(0, limit);
      } else {
        jobs = await jobRepository.findRecent(limit);
      }

      const data = jobs.map((j) => toEnrichmentJobDto(j));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  // GET /enrichment/jobs/:id
  router.get('/enrichment/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = EnrichmentJobIdParamSchema.parse(req.params);
      const job = await jobRepository.findById(id);
      if (!job) throw new NotFoundError(`Enrichment job ${id} not found`);
      res.json({ data: toEnrichmentJobDto(job) });
    } catch (error) {
      next(error);
    }
  });

  // POST /enrichment/jobs/:id/pause
  router.post(
    '/enrichment/jobs/:id/pause',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = EnrichmentJobIdParamSchema.parse(req.params);
        const job = await jobRepository.findById(id);
        if (!job) throw new NotFoundError(`Enrichment job ${id} not found`);

        if (job.status === 'PAUSED' || job.status === 'PAUSING') {
          res.json({ data: toEnrichmentJobDto(job) });
          return;
        }
        if (job.status === 'COMPLETED' || job.status === 'CANCELLED' || job.status === 'FAILED') {
          throw new ConflictError(`Cannot pause job in status ${job.status}`);
        }

        const result = await jobRepository.requestPause(id);
        if (!result.requested || !result.job) {
          throw new ConflictError(`Cannot pause job ${id} (status ${job.status})`);
        }

        res.json({ data: toEnrichmentJobDto(result.job) });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /enrichment/jobs/:id/resume
  router.post(
    '/enrichment/jobs/:id/resume',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = EnrichmentJobIdParamSchema.parse(req.params);
        const job = await jobRepository.findById(id);
        if (!job) throw new NotFoundError(`Enrichment job ${id} not found`);

        if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
          throw new ConflictError(`Cannot resume job in status ${job.status}`);
        }
        if (job.status === 'RUNNING' || job.status === 'PAUSING') {
          const isActive =
            job.ownerId !== null &&
            job.leaseExpiresAt !== null &&
            job.leaseExpiresAt.getTime() > Date.now();
          if (isActive) {
            throw new ConflictError(`Job ${id} is already running (owner ${job.ownerId})`);
          }
        }

        const ownerId = `api:${(req as unknown as { requestId?: string }).requestId ?? 'resume'}`;
        const result = await jobRepository.tryAcquireLease(id, ownerId, 60_000);
        if (!result.acquired || !result.job) {
          throw new ConflictError(
            `Cannot acquire lease for job ${id} (owner ${result.job?.ownerId ?? 'unknown'})`,
          );
        }

        res.json({ data: toEnrichmentJobDto(result.job) });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
