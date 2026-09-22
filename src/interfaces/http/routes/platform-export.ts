import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../../shared/errors/errors.js';
import type { PlatformCatalogService } from '../../../application/platform-catalog-service.js';
import { getExportCursor, toExportRecord } from '../../../application/platform-games-export-service.js';

export interface PlatformExportRouterDependencies {
  platformCatalogService: PlatformCatalogService;
}

const paramsSchema = z.object({
  platform: z.string().min(1).transform((s) => decodeURIComponent(s).trim()).pipe(z.string().min(1)),
});

const querySchema = z.object({
  format: z.enum(['csv', 'json']).default('json'),
});

function slugify(platform: string): string {
  return platform.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function escapeCsvValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(record: ReturnType<typeof toExportRecord>): string {
  const fields = [
    record.domainId,
    record.title,
    record.platforms.join('|'),
    record.releaseYear !== null ? String(record.releaseYear) : '',
    record.genres.join('|'),
    record.developers.join('|'),
    record.publishers.join('|'),
    record.description ?? '',
    record.coverUrl ?? '',
    record.classification,
  ];
  return fields.map(escapeCsvValue).join(',');
}

export function platformExportRouter(deps: PlatformExportRouterDependencies): Router {
  const router = Router();

  router.get('/platforms/:platform/games/export', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { platform } = paramsSchema.parse(req.params);
      const { format } = querySchema.parse(req.query);

      // Validate platform existence via catalog service
      const platformList = await deps.platformCatalogService.listPlatforms({ page: 1, limit: 100, showEmpty: true } as unknown as Parameters<PlatformCatalogService['listPlatforms']>[0]);
      const exists = (platformList.data as unknown as { items: { name: string }[] }).items?.some((p) => p.name === platform);
      let platformExists = exists;
      if (!platformExists) {
        const all = await deps.platformCatalogService.listPlatforms({ page: 1, limit: 200, showEmpty: true } as unknown as Parameters<PlatformCatalogService['listPlatforms']>[0]);
        platformExists = (all.data as unknown as { items: { name: string }[] }).items.some((p) => p.name === platform);
      }
      if (!platformExists) {
        throw new AppError('PLATFORM_NOT_FOUND', `Platform ${platform} not found`, 404);
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      const slug = slugify(platform);
      const filename = `atp-${slug}-games-${dateStr}.${format}`;

      // Disable timeout for this long streaming request
      // @ts-ignore - requestTimeoutMiddleware uses res.on('finish') to clear, we can disable by clearing timer via res.setTimeout(0)
      if (typeof (req as unknown as { setTimeout?: (ms: number) => void }).setTimeout === 'function') {
        (req as unknown as { setTimeout: (ms: number) => void }).setTimeout(0);
      }
      if (typeof (res as unknown as { setTimeout?: (ms: number) => void }).setTimeout === 'function') {
        (res as unknown as { setTimeout: (ms: number) => void }).setTimeout(0);
      }

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.write('[');
        let first = true;
        const cursor = getExportCursor(platform);
        let hasError = false;
        cursor.on('error', (err) => {
          hasError = true;
          if (!res.headersSent) {
            next(err);
          } else {
            res.end();
          }
        });
        for await (const doc of cursor) {
          if (hasError) break;
          // @ts-ignore doc is lean
          const record = toExportRecord(doc as Parameters<typeof toExportRecord>[0], platform);
          if (!first) res.write(',');
          res.write(JSON.stringify(record));
          first = false;
          // Respect backpressure
          if (!res.writable) break;
        }
        res.write(']');
        res.end();
        return;
      } else {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        const header = 'domainId,title,platforms,releaseYear,genres,developers,publishers,description,coverUrl,classification';
        res.write(header + '\n');
        const cursor = getExportCursor(platform);
        let hasError = false;
        cursor.on('error', (err) => {
          hasError = true;
          if (!res.headersSent) next(err);
          else res.end();
        });
        for await (const doc of cursor) {
          if (hasError) break;
          const record = toExportRecord(doc as Parameters<typeof toExportRecord>[0], platform);
          res.write(toCsvRow(record) + '\n');
          if (!res.writable) break;
        }
        res.end();
        return;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(new AppError('VALIDATION_ERROR', 'Invalid request data', 400));
        return;
      }
      next(error);
    }
  });

  return router;
}
