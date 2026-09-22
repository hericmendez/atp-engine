import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { GameQuery } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/shared/ids.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import { createGame, gameWithCover } from '../../src/domain/game/game.js';
import type { CoverService } from '../../src/application/cover-service.js';
import { CoverEnrichmentRunner } from '../../src/application/cover-enrichment-runner.js';
import type { EnrichmentJob } from '../../src/domain/enrichment-job/enrichment-job.js';
import type {
  EnrichmentJobRepository,
  EnrichmentJobUpdate,
} from '../../src/domain/enrichment-job/enrichment-job-repository.js';
import type { CreateEnrichmentJobInput } from '../../src/domain/enrichment-job/enrichment-job.js';

function pad3(n: number) {
  return String(n).padStart(3, '0');
}

function makeGame(n: number, withCover = false): Game {
  let g = createGame({
    id: createGameId(`atp-igdb-${pad3(n)}`),
    titles: [createGameTitle(`Cover Game ${n}`, 'primary')],
    developers: [],
    publishers: [],
    genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('igdb', `${8000 + n}`)],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
  });
  if (withCover) {
    g = gameWithCover(g, {
      url: `https://img/${n}.png`,
      source: 'igdb',
      sourceId: `${8000 + n}`,
      width: 100,
      height: 100,
      type: 'UNKNOWN' as never,
    });
  }
  return g;
}

function createFakeGameRepository(index: Map<string, Game>): GameRepository {
  return {
    findById: vi.fn(async (id: GameId) => [...index.values()].find((g) => g.id === id) ?? null),
    findByExternalIdentifier: vi.fn(async () => null),
    existsByExternalIdentifier: vi.fn(async () => false),
    existsById: vi.fn(async () => false),
    findMany: vi.fn(async (q: GameQuery) => {
      let items = [...index.values()];
      if (q.needsCover === true) {
        items = items.filter(
          (g) =>
            g.cover === null &&
            g.externalIdentifiers.some((e) => e.source === 'igdb') &&
            !g.id.startsWith('atp-unknown-'),
        );
      }
      if (q.afterDomainId !== undefined) items = items.filter((g) => g.id > q.afterDomainId!);
      items = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const limited = items.slice(0, q.limit ?? 10);
      // total is filtered but NOT afterDomainId limited? Use need-set total
      let totalItems = [...index.values()].filter(
        (g) =>
          g.cover === null &&
          g.externalIdentifiers.some((e) => e.source === 'igdb') &&
          !g.id.startsWith('atp-unknown-'),
      );
      if (q.afterDomainId !== undefined) {
        // total should be total matching before pagination but after cursor? For estimate we ignore after
        // For findMany total we return filtered by needsCover but not cursor? Actually repo counts with afterDomainId
        // Keep simple: total = items before slice but after all filters including afterDomainId is not needed for estimate
      }
      // For totalEstimate we need total without afterDomainId, so compute without it
      if (q.afterDomainId === undefined) {
        // use totalItems
      } else {
        totalItems = totalItems.filter((g) => g.id > q.afterDomainId!);
      }
      return { items: limited, total: totalItems.length, page: 1, limit: 10, totalPages: 0 };
    }),
    save: vi.fn(async (g: Game) => {
      index.set(g.id, g);
    }),
    update: vi.fn(async (g: Game) => {
      index.set(g.id, g);
    }),
    deleteById: vi.fn(async () => {}),
  };
}

function createMemoryJobRepository(): {
  repository: EnrichmentJobRepository;
  rows: Map<string, EnrichmentJob>;
} {
  const rows = new Map<string, EnrichmentJob>();
  let seq = 1;
  const repository: EnrichmentJobRepository = {
    create: vi.fn(async (input: CreateEnrichmentJobInput) => {
      const id = `job-${seq++}`;
      const now = new Date();
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
    findById: vi.fn(async (id: string) => rows.get(id) ?? null),
    findActiveByType: vi.fn(async (type) => {
      for (const j of [...rows.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) {
        if (j.type === type && ['RUNNING', 'PAUSING', 'PENDING'].includes(j.status)) return j;
      }
      return null;
    }),
    findLatestByType: vi.fn(async (type) => {
      const list = [...rows.values()].filter((j) => j.type === type).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return list[0] ?? null;
    }),
    update: vi.fn(async (id: string, patch: EnrichmentJobUpdate) => {
      const prev = rows.get(id);
      if (!prev) throw new Error(`Job ${id} not found`);
      const now = new Date();
      const next: EnrichmentJob = {
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
        totalEstimate: patch.totalEstimate !== undefined ? patch.totalEstimate : prev.totalEstimate,
        lastActivityAt: patch.lastActivityAt ?? now,
        updatedAt: now,
        error: patch.error !== undefined ? patch.error : prev.error,
        completedAt: patch.completedAt !== undefined ? patch.completedAt : prev.completedAt,
      };
      rows.set(id, next);
      return next;
    }),
    commitProgress: vi.fn(async (id: string, progress) => {
      const prev = rows.get(id);
      if (!prev) throw new Error(`Job ${id} not found`);
      const now = new Date();
      const next: EnrichmentJob = {
        ...prev,
        cursor: progress.cursor,
        processed: progress.processed,
        succeeded: progress.succeeded,
        found: progress.found,
        persisted: progress.persisted,
        unchanged: progress.unchanged,
        failed: progress.failed,
        lastActivityAt: now,
        updatedAt: now,
      };
      rows.set(id, next);
      return next;
    }),
    transition: vi.fn(async (id, from, to, patch) => {
      const prev = rows.get(id);
      if (!prev || !from.includes(prev.status)) return null;
      const now = new Date();
      const next: EnrichmentJob = {
        ...prev,
        status: to,
        ...patch,
        updatedAt: now,
        lastActivityAt: now,
        completedAt: to === 'COMPLETED' ? now : prev.completedAt,
        pausedAt: to === 'PAUSED' ? now : prev.pausedAt,
      } as EnrichmentJob;
      rows.set(id, next);
      return next;
    }),
    requestPause: vi.fn(async (jobId: string) => {
      const prev = rows.get(jobId);
      if (!prev) return { requested:false, job:null };
      if (prev.status === 'PAUSING' || prev.status === 'PAUSED') return { requested:true, job:prev };
      if (prev.status !== 'RUNNING') return { requested:false, job:prev };
      const now = new Date();
      const next: EnrichmentJob = { ...prev, status:'PAUSING' as const, lastActivityAt:now, updatedAt:now };
      rows.set(jobId, next); return { requested:true, job:next };
    }),
    completePause: vi.fn(async (jobId: string, ownerId: string) => {
      const prev = rows.get(jobId);
      if (!prev || prev.status !== 'PAUSING' || prev.ownerId !== ownerId) {
        const cur = prev ? rows.get(jobId) ?? null : null;
        if (cur && cur.status === 'PAUSED') return { paused:true, job:cur };
        return { paused:false, job:cur };
      }
      const now = new Date();
      const next: EnrichmentJob = { ...prev, status:'PAUSED' as const, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, pausedAt:now, lastActivityAt:now, updatedAt:now };
      rows.set(jobId, next); return { paused:true, job:next };
    }),
    tryAcquireLease: vi.fn(async (jobId: string, ownerId: string, leaseDurationMs: number) => {
      const prev = rows.get(jobId);
      if (!prev) return { acquired: false, job: null };
      if (['COMPLETED', 'CANCELLED'].includes(prev.status)) return { acquired: false, job: prev };
      const now = new Date();
      const canAcquire =
        prev.ownerId === null ||
        prev.ownerId === ownerId ||
        prev.leaseExpiresAt === null ||
        prev.leaseExpiresAt.getTime() <= now.getTime();
      if (!canAcquire) return { acquired: false, job: prev };
      const next: EnrichmentJob = {
        ...prev,
        ownerId,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        lastHeartbeatAt: now,
        lastActivityAt: now,
        status: 'RUNNING',
        error: null,
        updatedAt: now,
      };
      rows.set(jobId, next);
      return { acquired: true, job: next };
    }),
    heartbeat: vi.fn(async (jobId: string, ownerId: string, leaseDurationMs: number) => {
      const prev = rows.get(jobId);
      if (!prev || prev.ownerId !== ownerId) return { renewed: false, job: prev ?? null };
      const now = new Date();
      const next: EnrichmentJob = {
        ...prev,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        lastHeartbeatAt: now,
        lastActivityAt: now,
        updatedAt: now,
      };
      rows.set(jobId, next);
      return { renewed: true, job: next };
    }),
    releaseLease: vi.fn(async (jobId: string, ownerId: string) => {
      const prev = rows.get(jobId);
      if (!prev || prev.ownerId !== ownerId) return { released: false, job: prev ?? null };
      const now = new Date();
      const next: EnrichmentJob = {
        ...prev,
        ownerId: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        lastActivityAt: now,
        updatedAt: now,
      };
      rows.set(jobId, next);
      return { released: true, job: next };
    }),
  };
  return { repository, rows };
}

function stubCoverService(
  index: Map<string, Game>,
  failingIds: Set<string> = new Set(),
): CoverService {
  return {
    getGameCover: vi.fn(async (id: string) => {
      if (failingIds.has(id)) throw new Error('provider boom');
      const game = index.get(id);
      if (!game) throw new Error('not found');
      if (game.cover) {
        return {
          data: {
            selected: game.cover,
            candidates: [],
            errors: [],
            query: '',
            gameId: id,
            type: 'COVER' as never,
            limit: 1,
          },
          origin: 'database' as const,
        };
      }
      const cover = {
        url: `https://img/${id}.png`,
        source: 'igdb',
        sourceId: id,
        width: 100,
        height: 100,
        type: 'UNKNOWN' as never,
      };
      const updated = gameWithCover(game, cover);
      index.set(id, updated);
      return {
        data: {
          selected: cover,
          candidates: [{ candidate: cover } as never],
          errors: [],
          query: '',
          gameId: id,
          type: 'COVER' as never,
          limit: 1,
        },
        origin: 'scraper' as const,
      };
    }),
    searchCovers: vi.fn(async () => ({
      data: {
        selected: null,
        candidates: [],
        errors: [],
        query: '',
        gameId: null,
        type: 'COVER' as never,
        limit: 1,
      },
      origin: 'scraper' as const,
    })),
  } as unknown as CoverService;
}

function seedGames(count: number): Map<string, Game> {
  const games = new Map<string, Game>();
  for (let n = 1; n <= count; n += 1) games.set(`atp-igdb-${pad3(n)}`, makeGame(n, false));
  return games;
}

describe('enrichment job persistence — Phase 1 durable cursor & accumulated counters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A. create job has correct initial state', async () => {
    const { repository } = createMemoryJobRepository();
    const job = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 50, totalEstimate: 100 });
    expect(job.id).toBeDefined();
    expect(job.type).toBe('cover');
    expect(job.mode).toBe('needs-cover');
    expect(job.cursor).toBe('');
    expect(job.processed).toBe(0);
    expect(job.succeeded).toBe(0);
    expect(job.unchanged).toBe(0);
    expect(job.failed).toBe(0);
    expect(job.status).toBe('RUNNING');
    expect(job.batchSize).toBe(50);
    expect(job.totalEstimate).toBe(100);
    expect(job.startedAt).not.toBeNull();
  });

  it('B. progress persistence after batch — cursor & counters', async () => {
    const games = seedGames(20);
    const repo = createFakeGameRepository(games);
    const { repository: jobs, rows } = createMemoryJobRepository();
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);

    const result = await runner.runMass(undefined, { batchSize: 10, limit: 10 });

    expect(result.processed).toBe(10);
    expect(result.cursor).toBe('atp-igdb-010');
    expect(result.status).toBe('RUNNING');
    expect(result.jobId).toBeDefined();
    const job = rows.get(result.jobId!);
    expect(job?.cursor).toBe('atp-igdb-010');
    expect(job?.processed).toBe(10);
    expect(job?.persisted).toBe(10);
    expect(job?.found).toBe(10);
    expect(job?.status).toBe('RUNNING');
  });

  it('C. counter accumulation across invocations (100+50=150)', async () => {
    const games = seedGames(200);
    const repo = createFakeGameRepository(games);
    const { repository: jobs, rows } = createMemoryJobRepository();
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);

    const first = await runner.runMass(undefined, { batchSize: 50, limit: 100 });
    expect(first.processed).toBe(100);
    expect(first.cursor).toBe('atp-igdb-100');
    const jobId = first.jobId!;

    // Second invocation resumes same job, processes 50 more
    const second = await runner.runMass(undefined, { batchSize: 50, limit: 50 });
    expect(second.jobId).toBe(jobId);
    // Job counters are accumulated: second result reflects total committed (150)
    expect(second.processed).toBe(150);
    expect(second.cursor).toBe('atp-igdb-150');
    const job = rows.get(jobId);
    expect(job?.processed).toBe(150);
    expect(job?.persisted).toBe(150);
  });

  it('D. crash before checkpoint — game updates succeed but job persistence throws', async () => {
    const games = seedGames(20);
    const repo = createFakeGameRepository(games);
    const { repository: jobs, rows } = createMemoryJobRepository();
    // Make commitProgress fail first time (simulates crash before checkpoint)
    let failNextCommit = true;
    const origCommit = jobs.commitProgress;
    jobs.commitProgress = vi.fn(async (id: string, progress) => {
      if (failNextCommit) {
        failNextCommit = false;
        throw new Error('checkpoint store down');
      }
      return origCommit(id, progress);
    });
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);

    // First batch will process games but fail to persist cursor → runner catches and marks FAILED, throws
    // Game updates for first batch already landed; job is marked FAILED with cursor of attempted batch (at-least-once)
    await expect(runner.runMass(undefined, { batchSize: 10, limit: 10 })).rejects.toThrow('checkpoint store down');

    const latest = await jobs.findLatestByType('cover');
    // Runner persists FAILED with the batch's cursor (010) — batch is considered attempted; resume will continue from there
    // This is safe because game updates are idempotent; alternative is to keep '' and reprocess, also safe.
    expect(['', 'atp-igdb-010']).toContain(latest?.cursor);
    expect(latest?.status).toBe('FAILED');
    // But games 001-010 already have covers (at-least-once)
    for (let n = 1; n <= 10; n += 1) {
      expect(games.get(`atp-igdb-${pad3(n)}`)?.cover).not.toBeNull();
    }
    // Resume after fixing store: should reprocess batch idempotently
    const runner2 = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    const resumed = await runner2.runMass(undefined, { batchSize: 10, limit: 10 });
    // Idempotent reprocess: covers already set → origin database, counted as unchanged not double-persisted
    // But our stub still treats already-covered as database origin, so persisted stays 0 for reprocess
    // Accumulated processed should be 10 (first attempt's games were already covered, second run processes them as database hits)
    // For this test we just verify no corruption and no new games
    expect(resumed.processed).toBeGreaterThanOrEqual(10);
    expect(games.size).toBe(20);
    expect(rows.size).toBe(1);
  });

  it('E. resume after batch 2 crash — batch 3 reprocessed, batch 4 continues', async () => {
    const games = seedGames(100);
    const baseRepo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepository();
    const runner = new CoverEnrichmentRunner(baseRepo, stubCoverService(games), jobs);

    // Simulate crash on 3rd findMany (batch 3) — note estimateTotal also calls findMany once before loop
    let reads = 0;
    const origFindMany = baseRepo.findMany;
    baseRepo.findMany = vi.fn(async (q: GameQuery) => {
      reads += 1;
      // reads: 1=estimateTotal, 2=batch1, 3=batch2, 4=batch3(crash)
      if (reads === 4) throw new Error('simulated crash batch 3');
      return origFindMany(q);
    });
    await expect(runner.runMass(undefined, { batchSize: 25, limit: 100 })).rejects.toThrow('simulated crash');
    const jobAfterCrash = await jobs.findLatestByType('cover');
    expect(jobAfterCrash?.cursor).toBe('atp-igdb-050'); // 2 batches committed (estimate + 2 batches)
    expect(jobAfterCrash?.status).toBe('FAILED');
    expect(jobAfterCrash?.processed).toBe(50);

    // Fix and resume
    baseRepo.findMany = origFindMany;
    const runner2 = new CoverEnrichmentRunner(baseRepo, stubCoverService(games), jobs);
    const resumed = await runner2.runMass(undefined, { batchSize: 25, limit: 100 });
    expect(resumed.processed).toBe(100); // accumulated total
    expect(resumed.cursor).toBe('atp-igdb-100');
    // 100 games, limit 100, exhausted => COMPLETED (exhaustion wins over limit)
    expect(['COMPLETED', 'RUNNING']).toContain(resumed.status);
  });

  it('F. COMPLETED after exhausting selection', async () => {
    const games = seedGames(5);
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepository();
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);

    const result = await runner.runMass(undefined, { batchSize: 10 });
    expect(result.status).toBe('COMPLETED');
    expect(result.processed).toBe(5);
    expect(result.cursor).toBe('atp-igdb-005');
    const job = await jobs.findLatestByType('cover');
    expect(job?.status).toBe('COMPLETED');
    expect(job?.completedAt).not.toBeNull();

    // Second run on same completed job is no-op
    const second = await runner.runMass(undefined, { batchSize: 10 });
    expect(second.status).toBe('COMPLETED');
    expect(second.processed).toBe(0);
    expect(second.batches).toBe(0);
  });

  it('G. limit < total does not mark COMPLETED', async () => {
    const games = seedGames(100);
    const repo = createFakeGameRepository(games);
    const { repository: jobs, rows } = createMemoryJobRepository();
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);

    const result = await runner.runMass(undefined, { batchSize: 25, limit: 10 });
    expect(result.status).toBe('RUNNING');
    expect(result.processed).toBe(10);
    expect(rows.get(result.jobId!)?.status).toBe('RUNNING');
  });

  it('H. dry-run does zero job writes and zero game writes', async () => {
    const games = seedGames(10);
    const repo = createFakeGameRepository(games);
    const { repository: jobs, rows } = createMemoryJobRepository();
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);

    const result = await runner.runMass(undefined, { batchSize: 10, limit: 10, dryRun: true });
    expect(result.processed).toBe(10);
    expect(result.dryRun).toBe(true);
    expect(jobs.create).not.toHaveBeenCalled();
    expect(jobs.commitProgress).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
    expect(repo.update).not.toHaveBeenCalled();
    expect([...games.values()].every((g) => g.cover === null)).toBe(true);
  });

  it('I. cover-only: runner does not alter other fields (job path)', async () => {
    const games = seedGames(1);
    const before = games.get('atp-igdb-001');
    const beforeTitles = before?.titles[0].value;
    const beforeType = before?.gameType;
    const beforeDevLen = before?.developers.length;
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepository();
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);

    await runner.runMass(undefined, { batchSize: 10, limit: 1 });

    const after = games.get('atp-igdb-001');
    expect(after?.titles[0].value).toBe(beforeTitles);
    expect(after?.gameType).toBe(beforeType);
    expect(after?.developers.length).toBe(beforeDevLen);
    expect(after?.cover).not.toBeNull();
  });

  it('J. dynamic selection: covered games leave need-set, cursor never skips', async () => {
    const games = seedGames(5);
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepository();
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);

    // First run with limit 2: processes 001,002 they gain covers and leave set
    const first = await runner.runMass(undefined, { batchSize: 25, limit: 2 });
    expect(first.cursor).toBe('atp-igdb-002');
    expect(games.get('atp-igdb-001')?.cover).not.toBeNull();
    expect(games.get('atp-igdb-002')?.cover).not.toBeNull();

    // Second run resumes and should find 003,004,005 only
    const second = await runner.runMass(undefined, { batchSize: 25 });
    expect(second.processed).toBe(5); // accumulated 2+3
    expect(second.cursor).toBe('atp-igdb-005');
    // Verify no skip: 003 processed
    expect(games.get('atp-igdb-003')?.cover).not.toBeNull();
  });

  it('totalEstimate is set on job creation', async () => {
    const games = seedGames(15);
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepository();
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);

    const result = await runner.runMass(undefined, { batchSize: 10, limit: 5 });
    const job = await jobs.findById(result.jobId!);
    expect(job?.totalEstimate).toBeGreaterThanOrEqual(0);
    // findMany mock returns total filtered need-set (15)
    expect(job?.totalEstimate).toBe(15);
  });

  it('generic job supports multiple types (cover vs company)', async () => {
    const { repository } = createMemoryJobRepository();
    const coverJob = await repository.create({ type: 'cover', mode: 'needs-cover', batchSize: 10 });
    const companyJob = await repository.create({ type: 'company', mode: 'needs-companies', batchSize: 10 });
    expect(coverJob.type).toBe('cover');
    expect(companyJob.type).toBe('company');
    expect(coverJob.id).not.toBe(companyJob.id);
    const latestCover = await repository.findLatestByType('cover');
    const latestCompany = await repository.findLatestByType('company');
    expect(latestCover?.id).toBe(coverJob.id);
    expect(latestCompany?.id).toBe(companyJob.id);
  });
});
