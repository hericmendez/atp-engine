import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/interfaces/http/app.js';
import { loadConfig, resetConfig } from '../src/infrastructure/config/config.js';
import { clearAllSessions } from '../src/infrastructure/auth/admin-session.js';
import { hashAdminPassword } from '../src/infrastructure/auth/admin-password.js';
import { clearLoginRateLimit } from '../src/interfaces/http/routes/admin-auth-routes.js';
import type { EnrichmentJobRepository } from '../src/domain/enrichment-job/enrichment-job-repository.js';
import type { EnrichmentJob } from '../src/domain/enrichment-job/enrichment-job.js';

const ADMIN_TOKEN = 'test-admin-token-1234567890123456';

function createMemoryRepo() {
  const rows = new Map<string, EnrichmentJob>();
  let seq = 1;
  const repo: EnrichmentJobRepository = {
    create: vi.fn(async (input) => {
      const id = `job-${String(seq++).padStart(3, '0')}`;
      const now = new Date();
      const job: EnrichmentJob = {
        id, type: input.type, mode: input.mode, status: 'RUNNING', cursor: '', processed: 0, succeeded: 0, found: 0, persisted: 0, unchanged: 0, failed: 0, totalEstimate: null, batchSize: input.batchSize, ownerId: null, leaseExpiresAt: null, lastHeartbeatAt: null, lastActivityAt: now, startedAt: now, pausedAt: null, completedAt: null, lastMessage: null, error: null, createdAt: now, updatedAt: now,
      };
      rows.set(id, job);
      return job;
    }),
    findById: vi.fn(async (id) => rows.get(id) ?? null),
    findActiveByType: vi.fn(async () => null),
    findLatestByType: vi.fn(async () => null),
    findRecent: vi.fn(async (limit = 10) => [...rows.values()].slice(0, limit)),
    findRecentByType: vi.fn(async () => []),
    update: vi.fn(async (id, patch) => {
      const prev = rows.get(id)!;
      const next = { ...prev, ...patch } as EnrichmentJob;
      rows.set(id, next);
      return next;
    }),
    commitProgress: vi.fn(async () => null as unknown as EnrichmentJob),
    transition: vi.fn(async () => null),
    tryAcquireLease: vi.fn(async (jobId, ownerId, ttl) => {
      const prev = rows.get(jobId);
      if (!prev) return { acquired: false, job: null };
      const next = { ...prev, ownerId, leaseExpiresAt: new Date(Date.now() + ttl), status: 'RUNNING' as const };
      rows.set(jobId, next);
      return { acquired: true, job: next };
    }),
    heartbeat: vi.fn(async () => ({ renewed: false, job: null })),
    releaseLease: vi.fn(async () => ({ released: false, job: null })),
    requestPause: vi.fn(async (jobId) => {
      const prev = rows.get(jobId);
      if (!prev) return { requested: false, job: null };
      const next = { ...prev, status: 'PAUSING' as const };
      rows.set(jobId, next);
      return { requested: true, job: next };
    }),
    completePause: vi.fn(async () => ({ paused: false, job: null })),
  } as unknown as EnrichmentJobRepository;
  return { repo, rows };
}

function buildApp(repo: EnrichmentJobRepository) {
  return createApp({
    games: { catalogService: { listGames: vi.fn(), searchGames: vi.fn() } as never },
    cover: { coverService: { searchCovers: vi.fn(), getGameCover: vi.fn() } as never },
    platforms: { platformCatalogService: { findMany: vi.fn() } as never },
    catalogSync: { catalogSyncService: {} as never },
    catalogSyncHistory: { historyRepository: {} as never },
    admin: { gameAdminService: {} as never },
    enrichmentJobs: { jobRepository: repo },
  });
}

describe('Enrichment Auth — F-010', () => {
  beforeEach(() => {
    resetConfig();
    clearAllSessions();
    clearLoginRateLimit();
  });

  it('POST /api/v1/enrichment/jobs/:id/pause without auth → 401', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryRepo();
    const job = await repo.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
    const app = buildApp(repo);
    const res = await request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/v1/enrichment/jobs/:id/resume without auth → 401', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryRepo();
    const job = await repo.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
    const app = buildApp(repo);
    const res = await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`);
    expect(res.status).toBe(401);
  });

  it('POST pause with session → 200', async () => {
    const hash = await hashAdminPassword('secret123');
    loadConfig({ ADMIN_USERNAME: 'admin', ADMIN_PASSWORD_HASH: hash, ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryRepo();
    const job = await repo.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
    const app = buildApp(repo);
    const login = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'secret123' });
    const cookie = login.headers['set-cookie'][0] as string;
    const res = await request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`).set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('POST resume with Bearer → 200', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryRepo();
    // prepare PAUSED job for resume to succeed
    const job = await repo.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
    // manually set PAUSED
    await repo.update(job.id, { status: 'PAUSED' } as never);
    const app = buildApp(repo);
    const res = await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('GET /api/v1/enrichment/jobs remains public', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryRepo();
    await repo.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
    const app = buildApp(repo);
    const res = await request(app).get('/api/v1/enrichment/jobs');
    expect(res.status).toBe(200);
  });
});
