import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/interfaces/http/app.js';
import { loadConfig, resetConfig } from '../../src/infrastructure/config/config.js';
import { EnrichmentOrchestrator } from '../../src/application/enrichment-orchestrator.js';
import type { EnrichmentJobRepository } from '../../src/domain/enrichment-job/enrichment-job-repository.js';

const ADMIN_TOKEN = 'test-admin-token-1234567890123456';

function createMemoryRepo() {
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
    findLatestByType: vi.fn(async (type) => {
      const list = [...rows.values()].filter((j) => j.type === type).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return list[0] ?? null;
    }),
    findRecent: vi.fn(async () => []),
    findRecentByType: vi.fn(async () => []),
    update: vi.fn(async () => null as unknown as import('../../src/domain/enrichment-job/enrichment-job.js').EnrichmentJob),
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

describe('POST /api/v1/admin/enrichment/jobs description', () => {
  beforeEach(() => {
    resetConfig();
    EnrichmentOrchestrator.clearLocks();
  });

  it('201 description', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryRepo();
    const coverRunner = { runMass: vi.fn(async () => ({ status: 'RUNNING', processed: 0, found: 0, persisted: 0, unchanged: 0, failed: 0, batches: 0, cursor: '', dryRun: false, durationMs: 0, jobId: 'job-001' })) } as unknown as import('../../src/application/cover-enrichment-runner.js').CoverEnrichmentRunner;
    const descRunner = { runMass: vi.fn(async () => ({ status: 'RUNNING', processed: 0, found: 0, persisted: 0, unchanged: 0, failed: 0, batches: 0, cursor: '', dryRun: false, durationMs: 0, jobId: 'job-001' })) } as unknown as import('../../src/application/description-enrichment-runner.js').DescriptionEnrichmentRunner;
    const orchestrator = new EnrichmentOrchestrator(repo, coverRunner, descRunner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const res = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'description', limit: 10, batchSize: 20 });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('description');
    expect(res.body.data.mode).toBe('needs-description');
    expect(res.body.data.id).toBeDefined();
  });

  it('cover and description can run simultaneously', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const { repo } = createMemoryRepo();
    const coverRunner = { runMass: vi.fn(async () => ({ status: 'RUNNING', processed: 0, found: 0, persisted: 0, unchanged: 0, failed: 0, batches: 0, cursor: '', dryRun: false, durationMs: 0, jobId: 'job-001' })) } as unknown as any;
    const descRunner = { runMass: vi.fn(async () => ({ status: 'RUNNING', processed: 0, found: 0, persisted: 0, unchanged: 0, failed: 0, batches: 0, cursor: '', dryRun: false, durationMs: 0, jobId: 'job-002' })) } as unknown as any;
    const orchestrator = new EnrichmentOrchestrator(repo, coverRunner, descRunner);
    const app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: {} as never },
      adminEnrichmentJobs: { jobRepository: repo, orchestrator },
    });
    const r1 = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'cover' });
    expect(r1.status).toBe(201);
    const r2 = await request(app).post('/api/v1/admin/enrichment/jobs').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ type: 'description' });
    expect(r2.status).toBe(201);
    expect(r1.body.data.id).not.toBe(r2.body.data.id);
  });
});
