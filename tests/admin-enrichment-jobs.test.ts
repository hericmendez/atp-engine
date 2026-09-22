import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import type { EnrichmentJobRepository } from '../src/domain/enrichment-job/enrichment-job-repository.js';
import type { EnrichmentJob } from '../src/domain/enrichment-job/enrichment-job.js';
import type { CreateEnrichmentJobInput } from '../src/domain/enrichment-job/enrichment-job.js';
import type { EnrichmentJobUpdate } from '../src/domain/enrichment-job/enrichment-job-repository.js';
import { loadConfig, resetConfig } from '../src/infrastructure/config/config.js';

const ADMIN_TOKEN = 'test-admin-token-123456';

function createMemoryJobRepo(clock: () => Date = () => new Date()) {
  const rows = new Map<string, EnrichmentJob>();
  let seq = 1;
  const repo: EnrichmentJobRepository = {
    create: vi.fn(async (input: CreateEnrichmentJobInput) => {
      const id = `job-${String(seq++).padStart(3, '0')}`;
      const now = clock();
      const job: EnrichmentJob = {
        id,
        type: input.type,
        mode: input.mode,
        status: input.status ?? 'RUNNING',
        cursor: input.cursor ?? '',
        processed: 0,
        succeeded: 0,
        found: 0,
        persisted: 0,
        unchanged: 0,
        failed: 0,
        totalEstimate: input.totalEstimate ?? null,
        batchSize: input.batchSize,
        ownerId: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        lastActivityAt: now,
        startedAt: now,
        pausedAt: null,
        completedAt: null,
        lastMessage: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(id, job);
      return job;
    }),
    findById: vi.fn(async (id) => rows.get(id) ?? null),
    findActiveByType: vi.fn(async (type) => {
      for (const j of [...rows.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()))
        if (j.type === type && ['RUNNING', 'PAUSING', 'PENDING'].includes(j.status)) return j;
      return null;
    }),
    findLatestByType: vi.fn(async (type) => {
      const list = [...rows.values()].filter((j) => j.type === type).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return list[0] ?? null;
    }),
    findRecent: vi.fn(async (limit = 10) =>
      [...rows.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, limit),
    ),
    findRecentByType: vi.fn(async (type, limit = 10) =>
      [...rows.values()]
        .filter((j) => j.type === type)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, limit),
    ),
    update: vi.fn(async (id, patch: EnrichmentJobUpdate) => {
      const prev = rows.get(id);
      if (!prev) throw new Error(`Job ${id} not found`);
      const now = clock();
      const next = {
        ...prev,
        ...patch,
        cursor: patch.cursor ?? prev.cursor,
        status: (patch.status as EnrichmentJob['status']) ?? prev.status,
        processed: patch.processed ?? prev.processed,
        succeeded: patch.succeeded ?? prev.succeeded,
        found: patch.found ?? prev.found,
        persisted: patch.persisted ?? prev.persisted,
        unchanged: patch.unchanged ?? prev.unchanged,
        failed: patch.failed ?? prev.failed,
        lastActivityAt: patch.lastActivityAt ?? now,
        updatedAt: now,
      } as EnrichmentJob;
      rows.set(id, next);
      return next;
    }),
    commitProgress: vi.fn(async (id, p) => {
      const prev = rows.get(id);
      if (!prev) throw new Error(`Job ${id} not found`);
      const now = clock();
      const next = { ...prev, cursor: p.cursor, processed: p.processed, succeeded: p.succeeded, found: p.found, persisted: p.persisted, unchanged: p.unchanged, failed: p.failed, lastActivityAt: now, updatedAt: now };
      rows.set(id, next);
      return next;
    }),
    transition: vi.fn(async (id, from, to, patch) => {
      const prev = rows.get(id);
      if (!prev || !from.includes(prev.status)) return null;
      const now = clock();
      const next = { ...prev, status: to, ...patch, updatedAt: now, lastActivityAt: now } as EnrichmentJob;
      rows.set(id, next);
      return next;
    }),
    tryAcquireLease: vi.fn(async (jobId, ownerId, ttl) => {
      const prev = rows.get(jobId);
      if (!prev) return { acquired: false, job: null };
      if (['COMPLETED', 'CANCELLED'].includes(prev.status)) return { acquired: false, job: prev };
      const now = clock();
      const can = prev.ownerId === null || prev.ownerId === ownerId || prev.leaseExpiresAt === null || prev.leaseExpiresAt.getTime() <= now.getTime();
      if (!can) return { acquired: false, job: prev };
      const next = { ...prev, ownerId, leaseExpiresAt: new Date(now.getTime() + ttl), lastHeartbeatAt: now, lastActivityAt: now, status: 'RUNNING' as const, error: null, updatedAt: now };
      rows.set(jobId, next);
      return { acquired: true, job: next };
    }),
    heartbeat: vi.fn(async (jobId, ownerId, ttl) => {
      const prev = rows.get(jobId);
      if (!prev || prev.ownerId !== ownerId) return { renewed: false, job: prev ?? null };
      const now = clock();
      const next = { ...prev, leaseExpiresAt: new Date(now.getTime() + ttl), lastHeartbeatAt: now, lastActivityAt: now, updatedAt: now };
      rows.set(jobId, next);
      return { renewed: true, job: next };
    }),
    releaseLease: vi.fn(async (jobId, ownerId) => {
      const prev = rows.get(jobId);
      if (!prev || prev.ownerId !== ownerId) return { released: false, job: prev ?? null };
      const now = clock();
      const next = { ...prev, ownerId: null, leaseExpiresAt: null, lastHeartbeatAt: null, lastActivityAt: now, updatedAt: now };
      rows.set(jobId, next);
      return { released: true, job: next };
    }),
    requestPause: vi.fn(async (jobId) => {
      const prev = rows.get(jobId);
      if (!prev) return { requested: false, job: null };
      if (prev.status === 'PAUSING' || prev.status === 'PAUSED') return { requested: true, job: prev };
      if (prev.status !== 'RUNNING') return { requested: false, job: prev };
      const now = clock();
      const next = { ...prev, status: 'PAUSING' as const, lastActivityAt: now, updatedAt: now };
      rows.set(jobId, next);
      return { requested: true, job: next };
    }),
    completePause: vi.fn(async (jobId, ownerId) => {
      const prev = rows.get(jobId);
      if (!prev || prev.status !== 'PAUSING' || prev.ownerId !== ownerId) {
        const cur = prev ?? null;
        if (cur && cur.status === 'PAUSED') return { paused: true, job: cur };
        return { paused: false, job: cur };
      }
      const now = clock();
      const next = { ...prev, status: 'PAUSED' as const, ownerId: null, leaseExpiresAt: null, lastHeartbeatAt: null, pausedAt: now, lastActivityAt: now, updatedAt: now };
      rows.set(jobId, next);
      return { paused: true, job: next };
    }),
  };
  return { repository: repo, rows };
}

function createMockCatalogService() {
  return {
    listGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }),
    searchGames: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }),
    getGameById: async () => { throw new Error('Not implemented'); },
  };
}
function createMockCoverService() {
  return {
    searchCovers: async (q: string) => ({ data: { query: q, gameId: null, type: 'cover' as const, limit: 1, selected: null, candidates: [], errors: [] }, origin: 'scraper' as const }),
    getGameCover: async (id: string) => ({ data: { query: '', gameId: id, type: 'cover' as const, limit: 1, selected: null, candidates: [], errors: [] }, origin: 'database' as const }),
  };
}
function createMockPlatformCatalogService() {
  return {
    listPlatforms: async () => ({ data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 }, origin: 'database' as const }),
    getPlatformById: async () => { throw new Error('Not implemented'); },
  };
}

function buildTestApp(repo: EnrichmentJobRepository) {
  return createApp({
    games: { catalogService: createMockCatalogService() as never },
    cover: { coverService: createMockCoverService() as never },
    platforms: { platformCatalogService: createMockPlatformCatalogService() as never },
    catalogSync: { catalogSyncService: {} as never },
    catalogSyncHistory: { historyRepository: {} as never },
    admin: { gameAdminService: {} as never },
    enrichmentJobs: { jobRepository: repo },
    adminEnrichmentJobs: { jobRepository: repo },
  });
}

describe('Admin Enrichment Control Plane — Fase 1B', () => {
  beforeEach(() => {
    resetConfig();
    vi.clearAllMocks();
  });

  describe('Autenticação', () => {
    it('GET /api/v1/admin/enrichment/jobs sem token → 401', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      const res = await request(app).get('/api/v1/admin/enrichment/jobs');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.requestId).toBeDefined();
    });

    it('GET /api/v1/admin/enrichment/jobs token inválido → 401', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs')
        .set('Authorization', 'Bearer wrong-token-1234567890');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/admin/enrichment/jobs token válido → 200', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('GET /api/v1/admin/enrichment/jobs/:id sem token → 401', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app).get(`/api/v1/admin/enrichment/jobs/${job.id}`);
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/admin/enrichment/jobs/:id/pause sem token → 401', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app).post(`/api/v1/admin/enrichment/jobs/${job.id}/pause`);
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/admin/enrichment/jobs/:id/resume sem token → 401', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app).post(`/api/v1/admin/enrichment/jobs/${job.id}/resume`);
      expect(res.status).toBe(401);
    });

    it('não expõe ADMIN_API_TOKEN em sucesso', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(JSON.stringify(res.body)).not.toContain(ADMIN_TOKEN);
    });

    it('não expõe ADMIN_API_TOKEN em 401', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs')
        .set('Authorization', 'Bearer wrong-token-1234567890');
      expect(JSON.stringify(res.body)).not.toContain(ADMIN_TOKEN);
    });
  });

  describe('Listagem', () => {
    it('lista sem filtros', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('progress');
      expect(res.body.data[0]).toHaveProperty('counters');
      expect(res.body.data[0]).toHaveProperty('owner');
      expect(res.body.data[0]).toHaveProperty('timing');
    });

    it('filtro por type', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs?type=cover')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((j: { type: string }) => j.type === 'cover')).toBe(true);
      const bad = await request(app)
        .get('/api/v1/admin/enrichment/jobs?type=invalid')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(bad.status).toBe(400);
    });

    it('filtro por status', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.update(job.id, { status: 'PAUSED' as const });
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs?status=PAUSED')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((j: { status: string }) => j.status === 'PAUSED')).toBe(true);
    });

    it('limit', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      for (let i = 0; i < 5; i++) await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs?limit=2')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('resposta usa presenter (progress, counters, owner, timing, message, error)', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10, totalEstimate: 100 });
      await repository.commitProgress(job.id, { cursor: 'atp-igdb-001', processed: 10, succeeded: 7, found: 7, persisted: 7, unchanged: 3, failed: 0 });
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      const dto = res.body.data[0];
      expect(dto.progress).toHaveProperty('processed');
      expect(dto.progress).toHaveProperty('percentage');
      expect(dto.progress).toHaveProperty('itemsPerSecond');
      expect(dto.progress).toHaveProperty('etaSeconds');
      expect(dto.counters).toMatchObject({ succeeded: 7, persisted: 7, unchanged: 3, failed: 0 });
      expect(dto.owner).toHaveProperty('id');
      expect(dto.timing).toHaveProperty('startedAt');
      expect(dto).toHaveProperty('message');
      expect(dto).toHaveProperty('error');
      expect(dto.cursor).toBe('atp-igdb-001');
    });
  });

  describe('Detalhe', () => {
    it('retorna job existente com presenter completo', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app)
        .get(`/api/v1/admin/enrichment/jobs/${job.id}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(job.id);
      expect(res.body.data).toHaveProperty('progress');
      expect(res.body.data).toHaveProperty('counters');
      expect(res.body.data).toHaveProperty('owner');
      expect(res.body.data).toHaveProperty('timing');
      expect(res.body.data).toHaveProperty('cursor');
    });

    it('404 job inexistente', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs/nonexistent-id-123')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.requestId).toBeDefined();
    });

    it('validação ID vazio → 400 ou 404 (não 500)', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      // Express trims params: empty id after /jobs/ is not routed; test with whitespace id
      const res = await request(app)
        .get('/api/v1/admin/enrichment/jobs/%20')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      // Zod trims and rejects empty after trim → 400 VALIDATION_ERROR
      expect([400, 404]).toContain(res.status);
      expect(['VALIDATION_ERROR', 'NOT_FOUND']).toContain(res.body.error.code);
    });
  });

  describe('POST pause', () => {
    it('chama requestPause e retorna PAUSING', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app)
        .post(`/api/v1/admin/enrichment/jobs/${job.id}/pause`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAUSING');
      expect(repository.requestPause).toHaveBeenCalledWith(job.id);
    });

    it('idempotente para PAUSED/PAUSING', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.tryAcquireLease(job.id, 'owner-A', 60_000);
      await repository.requestPause(job.id); // RUNNING → PAUSING
      await repository.completePause(job.id, 'owner-A'); // PAUSING → PAUSED
      const app = buildTestApp(repository);
      const res = await request(app)
        .post(`/api/v1/admin/enrichment/jobs/${job.id}/pause`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAUSED');
    });

    it('propaga 409 transição inválida (COMPLETED)', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.update(job.id, { status: 'COMPLETED' as const });
      const app = buildTestApp(repository);
      const res = await request(app)
        .post(`/api/v1/admin/enrichment/jobs/${job.id}/pause`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('propaga 409 para FAILED', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.update(job.id, { status: 'FAILED' as const, error: 'boom' as never });
      const app = buildTestApp(repository);
      const res = await request(app)
        .post(`/api/v1/admin/enrichment/jobs/${job.id}/pause`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(409);
    });

    it('404 job inexistente', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      const res = await request(app)
        .post('/api/v1/admin/enrichment/jobs/nonexistent/pause')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST resume', () => {
    it('chama tryAcquireLease e retorna RUNNING para PAUSED', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.tryAcquireLease(job.id, 'A', 60_000);
      await repository.requestPause(job.id);
      await repository.completePause(job.id, 'A');
      const app = buildTestApp(repository);
      const res = await request(app)
        .post(`/api/v1/admin/enrichment/jobs/${job.id}/resume`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RUNNING');
      expect(res.body.data.owner.id).toMatch(/^api:/);
    });

    it('permite takeover de lease expirado', async () => {
      let now = new Date('2026-01-01T00:00:00Z');
      const clock = () => now;
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo(clock);
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.tryAcquireLease(job.id, 'A', 1000);
      now = new Date(now.getTime() + 2000);
      const app = buildTestApp(repository);
      const res = await request(app)
        .post(`/api/v1/admin/enrichment/jobs/${job.id}/resume`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.owner.id).not.toBe('A');
    });

    it('409 lease válido ainda ativo', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.tryAcquireLease(job.id, 'A', 60_000);
      const app = buildTestApp(repository);
      const res = await request(app)
        .post(`/api/v1/admin/enrichment/jobs/${job.id}/resume`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('409 para COMPLETED', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.update(job.id, { status: 'COMPLETED' as const });
      const app = buildTestApp(repository);
      const res = await request(app)
        .post(`/api/v1/admin/enrichment/jobs/${job.id}/resume`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('404 job inexistente', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      const res = await request(app)
        .post('/api/v1/admin/enrichment/jobs/nonexistent/resume')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Regressão — rotas públicas e antigas inalteradas', () => {
    it('GET /health continua público', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });

    it('GET /api/v1/games continua público', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const app = buildTestApp(repository);
      const res = await request(app).get('/api/v1/games?limit=1');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('GET /api/v1/enrichment/jobs (antiga) continua funcionando sem auth', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app).get('/api/v1/enrichment/jobs');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('GET /api/v1/enrichment/jobs/:id antiga continua funcionando', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const res = await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(job.id);
    });

    it('POST /api/v1/enrichment/jobs/:id/pause agora exige auth (F-010)', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      const app = buildTestApp(repository);
      const unauth = await request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`);
      expect(unauth.status).toBe(401);
      const res = await request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAUSING');
    });

    it('POST /api/v1/enrichment/jobs/:id/resume agora exige auth (F-010)', async () => {
      loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
      const { repository } = createMemoryJobRepo();
      const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
      await repository.tryAcquireLease(job.id, 'A', 60_000);
      await repository.requestPause(job.id);
      await repository.completePause(job.id, 'A');
      const app = buildTestApp(repository);
      const unauth = await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`);
      expect(unauth.status).toBe(401);
      const res = await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
    });
  });
});
