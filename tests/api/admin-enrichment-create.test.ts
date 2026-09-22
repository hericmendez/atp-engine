import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/interfaces/http/app.js';
import { loadConfig, resetConfig } from '../../src/infrastructure/config/config.js';
import { clearAllSessions } from '../../src/infrastructure/auth/admin-session.js';
import { clearLoginRateLimit } from '../../src/interfaces/http/routes/admin-auth-routes.js';
import { EnrichmentOrchestrator } from '../../src/application/enrichment-orchestrator.js';
import type { EnrichmentJobRepository } from '../../src/domain/enrichment-job/enrichment-job-repository.js';
import { hashAdminPassword } from '../../src/infrastructure/auth/admin-password.js';

const ADMIN_TOKEN = 'test-admin-token-1234567890123456';

function createMemoryJobRepo() {
  const rows = new Map<string, import('../../src/domain/enrichment-job/enrichment-job.js').EnrichmentJob>();
  let seq = 1;
  const repo: EnrichmentJobRepository = {
    create: vi.fn(async (input) => {
      const id = `job-${String(seq++).padStart(3, '0')}`;
      const now = new Date();
      const job: import('../../src/domain/enrichment-job/enrichment-job.js').EnrichmentJob = {
        id, type: input.type, mode: input.mode, status: 'RUNNING', cursor: '', processed: 0, succeeded: 0, found: 0, persisted: 0, unchanged: 0, failed: 0, totalEstimate: null, batchSize: input.batchSize, ownerId: null, leaseExpiresAt: null, lastHeartbeatAt: null, lastActivityAt: now, startedAt: now, pausedAt: null, completedAt: null, lastMessage: null, error: null, createdAt: now, updatedAt: now,
      };
      rows.set(id, job);
      return job;
    }),
    findById: vi.fn(async (id) => rows.get(id) ?? null),
    findActiveByType: vi.fn(async (type) => {
      for (const j of rows.values()) if (j.type === type && ['RUNNING', 'PAUSING', 'PENDING'].includes(j.status)) return j;
      return null;
    }),
    findLatestByType: vi.fn(async (type) => {
      const list = [...rows.values()].filter((j) => j.type === type).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return list[0] ?? null;
    }),
    findRecent: vi.fn(async () => [...rows.values()]),
    findRecentByType: vi.fn(async () => []),
    findLatestByType2: vi.fn(async () => null),
    update: vi.fn(async (id, patch) => {
      const prev = rows.get(id)!;
      const next = { ...prev, ...patch } as import('../../src/domain/enrichment-job/enrichment-job.js').EnrichmentJob;
      rows.set(id, next);
      return next;
    }),
    commitProgress: vi.fn(async () => null as unknown as import('../../src/domain/enrichment-job/enrichment-job.js').EnrichmentJob),
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
    requestPause: vi.fn(async () => ({ requested: false, job: null })),
    completePause: vi.fn(async () => ({ paused: false, job: null })),
    findPaginated: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
  } as unknown as EnrichmentJobRepository;
  return { repo, rows };
}

function createMockRunner() {
  return {
    runMass: vi.fn(async (_checkpoints: unknown, opts: { jobId: string }) => ({
      status: 'RUNNING' as const,
      processed: 0,
      found: 0,
      persisted: 0,
      unchanged: 0,
      failed: 0,
      batches: 0,
      cursor: '',
      dryRun: false,
      durationMs: 0,
      jobId: opts.jobId,
    })),
  } as unknown as import('../../src/application/cover-enrichment-runner.js').CoverEnrichmentRunner;
}

describe('POST /api/v1/admin/enrichment/jobs', () => {
  beforeEach(() => {
    resetConfig();
    clearAllSessions();
    clearLoginRateLimit();
    EnrichmentOrchestrator.clearLocks();
  });

  it('401 sem auth', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryJobRepo();
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').send({ type: 'cover' });
    expect(res.status).toBe(401);
  });

  it('400 type inválido', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryJobRepo();
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'company' });
    expect(res.status).toBe(400);
  });

  it('400 payload inválido', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryJobRepo();
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({});
    expect(res.status).toBe(400);
  });

  it('201 criação de cover', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryJobRepo();
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.type).toBe('cover');
    expect(res.body.data.status).toBe('RUNNING');
  });

  it('201 com Bearer', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryJobRepo();
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover', limit: 10, batchSize: 20 });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
  });

  it('201 com sessão', async () => {
    const hash = await hashAdminPassword('secret123');
    loadConfig({ ADMIN_USERNAME: 'admin', ADMIN_PASSWORD_HASH: hash, ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryJobRepo();
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const login = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'secret123' });
    const cookie = login.headers['set-cookie'][0] as string;
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Cookie', cookie).send({ type: 'cover' });
    expect(res.status).toBe(201);
  });

  it('409 job RUNNING', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo, rows } = createMemoryJobRepo();
    const now = new Date();
    rows.set('job-001', {
      id: 'job-001', type: 'cover', mode: 'needs-cover', status: 'RUNNING', cursor: '', processed: 0, succeeded: 0, found: 0, persisted: 0, unchanged: 0, failed: 0, totalEstimate: null, batchSize: 50, ownerId: 'runner:1', leaseExpiresAt: new Date(Date.now() + 60000), lastHeartbeatAt: now, lastActivityAt: now, startedAt: now, pausedAt: null, completedAt: null, lastMessage: null, error: null, createdAt: now, updatedAt: now,
    } as never);
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' });
    expect(res.status).toBe(409);
  });

  it('409 job PAUSED', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo, rows } = createMemoryJobRepo();
    const now = new Date();
    rows.set('job-001', {
      id: 'job-001', type: 'cover', mode: 'needs-cover', status: 'PAUSED', cursor: '', processed: 10, succeeded: 5, found: 5, persisted: 5, unchanged: 5, failed: 0, totalEstimate: 100, batchSize: 50, ownerId: null, leaseExpiresAt: null, lastHeartbeatAt: null, lastActivityAt: now, startedAt: now, pausedAt: now, completedAt: null, lastMessage: null, error: null, createdAt: now, updatedAt: now,
    } as never);
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' });
    expect(res.status).toBe(409);
  });

  it('409 job FAILED', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo, rows } = createMemoryJobRepo();
    const now = new Date();
    rows.set('job-001', {
      id: 'job-001', type: 'cover', mode: 'needs-cover', status: 'FAILED', cursor: '', processed: 10, succeeded: 5, found: 5, persisted: 5, unchanged: 5, failed: 1, totalEstimate: 100, batchSize: 50, ownerId: null, leaseExpiresAt: null, lastHeartbeatAt: null, lastActivityAt: now, startedAt: now, pausedAt: null, completedAt: null, lastMessage: null, error: 'boom', createdAt: now, updatedAt: now,
    } as never);
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' });
    expect(res.status).toBe(409);
  });

  it('COMPLETED permite novo job', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo, rows } = createMemoryJobRepo();
    const now = new Date();
    rows.set('job-001', {
      id: 'job-001', type: 'cover', mode: 'needs-cover', status: 'COMPLETED', cursor: 'done', processed: 100, succeeded: 50, found: 50, persisted: 50, unchanged: 50, failed: 0, totalEstimate: 100, batchSize: 50, ownerId: null, leaseExpiresAt: null, lastHeartbeatAt: null, lastActivityAt: now, startedAt: now, pausedAt: null, completedAt: now, lastMessage: null, error: null, createdAt: now, updatedAt: now,
    } as never);
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' });
    expect(res.status).toBe(201);
  });

  it('resposta possui job ID e não expõe lease interno cru', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryJobRepo();
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' });
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.type).toBe('cover');
    // DTO includes owner but not raw lease internal? Check not exposing internal fields beyond DTO
    expect(res.body.data).not.toHaveProperty('leaseExpiresAt');
  });

  it('500 com requestId e sem stack', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const repo = {
      findLatestByType: vi.fn(async () => { throw new Error('db failure'); }),
    } as unknown as EnrichmentJobRepository;
    const runner = createMockRunner();
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' });
    expect(res.status).toBe(500);
    expect(res.body.error.requestId).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });

  it('concorrência duas requests simultâneas não cria duplicado', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryJobRepo();
    const runner = createMockRunner();
    // Add delay to create to simulate race
    const origCreate = repo.create;
    let createCount = 0;
    repo.create = vi.fn(async (input) => {
      createCount++;
      await new Promise((r) => setTimeout(r, 20));
      return origCreate(input);
    }) as unknown as typeof repo.create;
    const orchestrator = new EnrichmentOrchestrator(repo, runner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const [a, b] = await Promise.all([
      request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' }),
      request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(createCount).toBe(1);
  });
});
