import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { healthRouter } from './routes/health.js';
import { gamesRouter, type GamesRouterDependencies } from './routes/games.js';
import { coverRouter, type CoverRouterDependencies } from './routes/cover.js';
import { platformRouter, type PlatformRouterDependencies } from './routes/platforms.js';
import { catalogSyncRouter, type CatalogSyncRouterDependencies } from './routes/catalog-sync.js';
import {
  catalogSyncHistoryRouter,
  type CatalogSyncHistoryRouterDependencies,
} from './routes/catalog-sync-history.js';
import { adminGamesRouter, type AdminGamesRouterDependencies } from './routes/admin-games.js';
import { enrichmentJobsRouter, type EnrichmentJobsRouterDependencies } from './routes/enrichment-jobs.js';
import { adminStatusRouter } from './routes/admin-status.js';
import {
  adminEnrichmentJobsRouter,
  type AdminEnrichmentJobsRouterDependencies,
} from './routes/admin-enrichment-jobs.js';
import {
  adminGamesReadRouter,
  type AdminGamesReadRouterDependencies,
} from './routes/admin-games-read.js';
import {
  adminCatalogSyncRouter,
  type AdminCatalogSyncRouterDependencies,
} from './routes/admin-catalog-sync.js';
import cookieParser from 'cookie-parser';
import { adminAuthRoutes } from './routes/admin-auth-routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requestLoggerMiddleware } from './middleware/request-logger.js';
import { requestTimeoutMiddleware } from './middleware/request-timeout.js';
import { rateLimiterMiddleware } from './middleware/rate-limiter.js';
import { NotFoundError } from '../../shared/errors/errors.js';

export interface AppDependencies {
  games: GamesRouterDependencies;
  cover: CoverRouterDependencies;
  platforms: PlatformRouterDependencies;
  catalogSync: CatalogSyncRouterDependencies;
  catalogSyncHistory: CatalogSyncHistoryRouterDependencies;
  admin: AdminGamesRouterDependencies;
  enrichmentJobs?: EnrichmentJobsRouterDependencies;
  adminEnrichmentJobs?: AdminEnrichmentJobsRouterDependencies;
  adminGamesRead?: AdminGamesReadRouterDependencies;
  adminCatalogSync?: AdminCatalogSyncRouterDependencies;
}

export function createApp(deps: AppDependencies): express.Express {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(requestTimeoutMiddleware({ timeoutMs: 30000 }));
  app.use(rateLimiterMiddleware({ windowMs: 60000, maxRequests: 100 }));
  app.use(healthRouter());

  // Public admin auth routes (login/logout/session) — no adminAuth
  app.use('/api/v1', adminAuthRoutes());

  const apiV1 = express.Router();
  apiV1.use(gamesRouter(deps.games));
  apiV1.use(coverRouter(deps.cover));
  apiV1.use(platformRouter(deps.platforms));
  apiV1.use(catalogSyncRouter(deps.catalogSync));
  apiV1.use(catalogSyncHistoryRouter(deps.catalogSyncHistory));
  apiV1.use(adminGamesRouter(deps.admin));
  if (deps.enrichmentJobs) {
    apiV1.use(enrichmentJobsRouter(deps.enrichmentJobs));
  }
  app.use('/api/v1', apiV1);

  // Administrative boundary — all routes under /api/v1/admin/* require
  // ADMIN_API_TOKEN via Authorization: Bearer <token>.
  // Mounted separately so public /api/v1 routes remain unaffected.
  const adminApi = express.Router();
  adminApi.use(adminStatusRouter());
  if (deps.adminEnrichmentJobs) {
    adminApi.use(adminEnrichmentJobsRouter(deps.adminEnrichmentJobs));
  }
  if (deps.adminGamesRead) {
    adminApi.use(adminGamesReadRouter(deps.adminGamesRead));
  }
  if (deps.adminCatalogSync) {
    adminApi.use(adminCatalogSyncRouter(deps.adminCatalogSync));
  }
  app.use('/api/v1/admin', adminApi);

  // Dashboard SPA — served at /admin (frontend). API remains at /api/v1/admin/*.
  // Mounted after API so /api/v1/admin/* is never captured by SPA fallback.
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // From dist/interfaces/http/app.js → ../../.. = atp-engine/
    const dashboardDist = path.resolve(__dirname, '../../../dashboard/dist');
    if (fs.existsSync(dashboardDist)) {
      app.use('/admin', express.static(dashboardDist));
      // SPA fallback for client-side routing, scoped to /admin only
      app.get('/admin/*', (_req, res) => {
        res.sendFile(path.join(dashboardDist, 'index.html'));
      });
    }
  } catch {
    // No dashboard build present — ignore (dev without dashboard)
  }

  app.use((_req, _res, next) => {
    next(new NotFoundError());
  });

  app.use(errorHandler);

  return app;
}
