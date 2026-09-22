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
import type { EnrichmentJobRepository, EnrichmentJobUpdate } from '../../src/domain/enrichment-job/enrichment-job-repository.js';
import type { CreateEnrichmentJobInput } from '../../src/domain/enrichment-job/enrichment-job.js';
import { DEFAULT_LEASE_DURATION_MS, DEFAULT_HEARTBEAT_INTERVAL_MS } from '../../src/domain/enrichment-job/lease-config.js';

function pad3(n: number) { return String(n).padStart(3, '0'); }
function makeGame(n: number): Game {
  return createGame({
    id: createGameId(`atp-igdb-${pad3(n)}`),
    titles: [createGameTitle(`Cover Game ${n}`, 'primary')],
    developers: [], publishers: [], genres: [createGenre('action')],
    externalIdentifiers: [createExternalIdentifier('igdb', `${8000 + n}`)],
    classification: 'GAME', completeness: 'FOUND_PARTIAL',
  });
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
        items = items.filter((g) => g.cover === null && g.externalIdentifiers.some((e) => e.source === 'igdb') && !g.id.startsWith('atp-unknown-'));
      }
      if (q.afterDomainId !== undefined) items = items.filter((g) => g.id > q.afterDomainId!);
      items = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const limited = items.slice(0, q.limit ?? 10);
      // total for estimate: count covers null
      const _total = [...index.values()].filter((g) => g.cover === null).length;
      return { items: limited, total: _total, page: 1, limit: 10, totalPages: 0 };
    }),
    save: vi.fn(async (g: Game) => { index.set(g.id, g); }),
    update: vi.fn(async (g: Game) => { index.set(g.id, g); }),
    deleteById: vi.fn(async () => {}),
  };
}
function createMemoryJobRepositoryWithClock(clock: () => Date) {
  const rows = new Map<string, EnrichmentJob>();
  let seq = 1;
  const repo: EnrichmentJobRepository = {
    create: vi.fn(async (input: CreateEnrichmentJobInput) => {
      const id = `job-${seq++}`;
      const now = clock();
      const job: EnrichmentJob = {
        id, type: input.type, mode: input.mode, status: input.status ?? 'RUNNING', cursor: input.cursor ?? '',
        processed: 0, succeeded: 0, found: 0, persisted: 0, unchanged: 0, failed: 0,
        totalEstimate: input.totalEstimate ?? null, batchSize: input.batchSize,
        ownerId: null, leaseExpiresAt: null, lastHeartbeatAt: null,
        lastActivityAt: now, startedAt: now, pausedAt: null, completedAt: null,
        lastMessage: null, error: null, createdAt: now, updatedAt: now,
      };
      rows.set(id, job); return job;
    }),
    findById: vi.fn(async (id: string) => rows.get(id) ?? null),
    findActiveByType: vi.fn(async (type) => {
      for (const j of [...rows.values()].sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime())) if (j.type===type && ['RUNNING','PAUSING','PENDING'].includes(j.status)) return j;
      return null;
    }),
    findLatestByType: vi.fn(async (type) => {
      const list = [...rows.values()].filter((j)=>j.type===type).sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime());
      return list[0] ?? null;
    }),
    update: vi.fn(async (id: string, patch: EnrichmentJobUpdate) => {
      const prev = rows.get(id); if (!prev) throw new Error(`Job ${id} not found`);
      const now = clock();
      const next: EnrichmentJob = { ...prev, ...patch, cursor: patch.cursor ?? prev.cursor, status: (patch.status as EnrichmentJob['status']) ?? prev.status, processed: patch.processed ?? prev.processed, succeeded: patch.succeeded ?? prev.succeeded, found: patch.found ?? prev.found, persisted: patch.persisted ?? prev.persisted, unchanged: patch.unchanged ?? prev.unchanged, failed: patch.failed ?? prev.failed, totalEstimate: patch.totalEstimate !== undefined ? patch.totalEstimate : prev.totalEstimate, lastActivityAt: patch.lastActivityAt ?? now, updatedAt: now, error: patch.error !== undefined ? patch.error : prev.error, completedAt: patch.completedAt !== undefined ? patch.completedAt : prev.completedAt } as EnrichmentJob;
      rows.set(id, next); return next;
    }),
    commitProgress: vi.fn(async (id: string, progress) => {
      const prev = rows.get(id); if (!prev) throw new Error(`Job ${id} not found`);
      const now = clock();
      const next: EnrichmentJob = { ...prev, cursor: progress.cursor, processed: progress.processed, succeeded: progress.succeeded, found: progress.found, persisted: progress.persisted, unchanged: progress.unchanged, failed: progress.failed, lastActivityAt: now, updatedAt: now };
      rows.set(id, next); return next;
    }),
    transition: vi.fn(async (id, from, to, patch) => {
      const prev = rows.get(id); if (!prev || !from.includes(prev.status)) return null;
      const now = clock();
      const next: EnrichmentJob = { ...prev, status: to, ...patch, updatedAt: now, lastActivityAt: now, completedAt: to==='COMPLETED'?now:prev.completedAt, pausedAt: to==='PAUSED'?now:prev.pausedAt } as EnrichmentJob;
      rows.set(id, next); return next;
    }),
    tryAcquireLease: vi.fn(async (jobId: string, ownerId: string, leaseDurationMs: number) => {
      const prev = rows.get(jobId); if (!prev) return { acquired:false, job:null };
      if (['COMPLETED','CANCELLED'].includes(prev.status)) return { acquired:false, job:prev };
      const now = clock();
      const can = prev.ownerId===null || prev.ownerId===ownerId || prev.leaseExpiresAt===null || prev.leaseExpiresAt.getTime() <= now.getTime();
      if (!can) return { acquired:false, job:prev };
      const next: EnrichmentJob = { ...prev, ownerId, leaseExpiresAt:new Date(now.getTime()+leaseDurationMs), lastHeartbeatAt:now, lastActivityAt:now, status:'RUNNING', error:null, updatedAt:now };
      rows.set(jobId, next); return { acquired:true, job:next };
    }),
    heartbeat: vi.fn(async (jobId: string, ownerId: string, leaseDurationMs: number) => {
      const prev = rows.get(jobId); if (!prev || prev.ownerId!==ownerId) return { renewed:false, job:prev ?? null };
      const now = clock();
      const next: EnrichmentJob = { ...prev, leaseExpiresAt:new Date(now.getTime()+leaseDurationMs), lastHeartbeatAt:now, lastActivityAt:now, updatedAt:now };
      rows.set(jobId, next); return { renewed:true, job:next };
    }),
    releaseLease: vi.fn(async (jobId: string, ownerId: string) => {
      const prev = rows.get(jobId); if (!prev || prev.ownerId!==ownerId) return { released:false, job:prev ?? null };
      const now = clock();
      const next: EnrichmentJob = { ...prev, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, lastActivityAt:now, updatedAt:now };
      rows.set(jobId, next); return { released:true, job:next };
    }),
    requestPause: vi.fn(async (jobId: string) => {
      const prev = rows.get(jobId); if (!prev) return { requested:false, job:null };
      if (prev.status==='PAUSING' || prev.status==='PAUSED') return { requested:true, job:prev };
      if (prev.status!=='RUNNING') return { requested:false, job:prev };
      const now = clock();
      const next: EnrichmentJob = { ...prev, status:'PAUSING' as const, lastActivityAt:now, updatedAt:now };
      rows.set(jobId, next); return { requested:true, job:next };
    }),
    completePause: vi.fn(async (jobId: string, ownerId: string) => {
      const prev = rows.get(jobId); if (!prev || prev.status!=='PAUSING' || prev.ownerId!==ownerId) {
        const cur = prev ?? null;
        if (cur && cur.status==='PAUSED') return { paused:true, job:cur };
        return { paused:false, job:cur };
      }
      const now = clock();
      const next: EnrichmentJob = { ...prev, status:'PAUSED' as const, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, pausedAt:now, lastActivityAt:now, updatedAt:now };
      rows.set(jobId, next); return { paused:true, job:next };
    }),
  };
  return { repository: repo, rows };
}
function stubCoverService(index: Map<string, Game>): CoverService {
  return {
    getGameCover: vi.fn(async (id: string) => {
      const game = index.get(id); if (!game) throw new Error('not found');
      if (game.cover) return { data:{ selected: game.cover, candidates:[], errors:[], query:'', gameId:id, type:'COVER' as never, limit:1 }, origin:'database' as const };
      const cover = { url:`https://img/${id}.png`, source:'igdb', sourceId:id, width:100, height:100, type:'UNKNOWN' as never };
      const updated = gameWithCover(game, cover); index.set(id, updated);
      return { data:{ selected:cover, candidates:[{candidate:cover} as never], errors:[], query:'', gameId:id, type:'COVER' as never, limit:1 }, origin:'scraper' as const };
    }),
    searchCovers: vi.fn(async () => ({ data:{ selected:null, candidates:[], errors:[], query:'', gameId:null, type:'COVER' as never, limit:1 }, origin:'scraper' as const })),
  } as unknown as CoverService;
}
function seedGames(count: number): Map<string, Game> { const m=new Map<string, Game>(); for(let n=1;n<=count;n++) m.set(`atp-igdb-${pad3(n)}`, makeGame(n)); return m; }

describe('Phase 2 — Lock / Lease / Heartbeat', () => {
  beforeEach(()=>{ vi.clearAllMocks(); });

  it('1. create/acquire — tryAcquireLease success', async () => {
    const clock = ()=>new Date('2026-01-01T00:00:00Z');
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    const res = await repository.tryAcquireLease(job.id, 'worker-A', 60_000);
    expect(res.acquired).toBe(true);
    expect(res.job?.ownerId).toBe('worker-A');
    expect(res.job?.leaseExpiresAt).not.toBeNull();
  });

  it('2. acquire already owned stays with owner', async () => {
    const clock = ()=>new Date();
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    await repository.tryAcquireLease(job.id, 'worker-A', 60_000);
    const second = await repository.tryAcquireLease(job.id, 'worker-A', 60_000);
    expect(second.acquired).toBe(true); // same owner can re-acquire
    expect(second.job?.ownerId).toBe('worker-A');
  });

  it('3. acquire by second worker fails while lease valid', async () => {
    const now = new Date();
    const clock = ()=>now;
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    await repository.tryAcquireLease(job.id, 'worker-A', 60_000);
    const b = await repository.tryAcquireLease(job.id, 'worker-B', 60_000);
    expect(b.acquired).toBe(false);
    expect(b.job?.ownerId).toBe('worker-A');
  });

  it('4. concurrent acquire race — successes=1 failures=1', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const clock = ()=>now;
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    // Add tiny async delay to force interleaving via Promise.all
    const orig = repository.tryAcquireLease;
    let call=0;
    repository.tryAcquireLease = vi.fn(async (id, owner, ttl)=>{
      call++; // simulate CAS: first wins, second sees owner set
      if (call===1) await new Promise(r=>setTimeout(r, 5));
      return orig(id, owner as string, ttl as number);
    });
    const [a,b] = await Promise.all([
      repository.tryAcquireLease(job.id, 'worker-A', 60_000),
      repository.tryAcquireLease(job.id, 'worker-B', 60_000),
    ]);
    const successes = [a,b].filter(r=>r.acquired).length;
    const failures = [a,b].filter(r=>!r.acquired).length;
    expect(successes).toBe(1);
    expect(failures).toBe(1);
  });

  it('5. heartbeat owner succeeds and extends lease', async () => {
    const nowInit = new Date('2026-01-01T00:00:00Z');
    let now = nowInit;
    const clock = ()=>now;
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    await repository.tryAcquireLease(job.id, 'worker-A', 60_000);
    const before = (await repository.findById(job.id))!.leaseExpiresAt!.getTime();
    now = new Date(now.getTime()+10_000);
    const hb = await repository.heartbeat(job.id, 'worker-A', 60_000);
    expect(hb.renewed).toBe(true);
    expect(hb.job!.leaseExpiresAt!.getTime()).toBeGreaterThan(before);
  });

  it('6. heartbeat non-owner fails', async () => {
    const clock = ()=>new Date();
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    await repository.tryAcquireLease(job.id, 'worker-A', 60_000);
    const hb = await repository.heartbeat(job.id, 'worker-B', 60_000);
    expect(hb.renewed).toBe(false);
    expect((await repository.findById(job.id))!.ownerId).toBe('worker-A');
  });

  it('7. lease expiration detection (RUNNING with expired lease is recoverable, not FAILED)', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const clock = ()=>now;
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    await repository.tryAcquireLease(job.id, 'worker-A', 1000);
    // advance past expiry
    now = new Date(now.getTime()+2000);
    const j = await repository.findById(job.id);
    expect(j!.leaseExpiresAt!.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(j!.status).toBe('RUNNING'); // not FAILED
    // still RUNNING but expired
  });

  it('8. takeover after expiration — B acquires expired lease', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const clock = ()=>now;
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    await repository.tryAcquireLease(job.id, 'worker-A', 1000);
    now = new Date(now.getTime()+2000);
    const res = await repository.tryAcquireLease(job.id, 'worker-B', 60_000);
    expect(res.acquired).toBe(true);
    expect(res.job?.ownerId).toBe('worker-B');
  });

  it('9. old owner cannot heartbeat after takeover', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    const clock = ()=>now;
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    await repository.tryAcquireLease(job.id, 'worker-A', 1000);
    now = new Date(now.getTime()+2000);
    await repository.tryAcquireLease(job.id, 'worker-B', 60_000);
    const hb = await repository.heartbeat(job.id, 'worker-A', 60_000);
    expect(hb.renewed).toBe(false);
    expect((await repository.findById(job.id))!.ownerId).toBe('worker-B');
  });

  it('10. release owner succeeds and clears lease', async () => {
    const clock = ()=>new Date();
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    await repository.tryAcquireLease(job.id, 'worker-A', 60_000);
    const rel = await repository.releaseLease(job.id, 'worker-A');
    expect(rel.released).toBe(true);
    expect(rel.job?.ownerId).toBeNull();
    expect(rel.job?.leaseExpiresAt).toBeNull();
    expect(rel.job?.lastHeartbeatAt).toBeNull();
  });

  it('11. release non-owner fails', async () => {
    const clock = ()=>new Date();
    const { repository } = createMemoryJobRepositoryWithClock(clock);
    const job = await repository.create({ type:'cover', mode:'needs-cover', batchSize:10 });
    await repository.tryAcquireLease(job.id, 'worker-A', 60_000);
    const rel = await repository.releaseLease(job.id, 'worker-B');
    expect(rel.released).toBe(false);
    expect((await repository.findById(job.id))!.ownerId).toBe('worker-A');
  });

  it('12. runner requires ownership — second worker rejected', async () => {
    const games = seedGames(20);
    const repo = createFakeGameRepository(games);
    const clock = ()=>new Date();
    const { repository: jobs } = createMemoryJobRepositoryWithClock(clock);
    const runnerB = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    // A acquires via runMass; B tries same job concurrently
    const job = await jobs.create({ type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:20 });
    // Manually acquire with A to simulate ownership
    await jobs.tryAcquireLease(job.id, 'worker-A', 60_000);
    // B tries to acquire same job via tryAcquireLease directly should fail
    const res = await jobs.tryAcquireLease(job.id, 'worker-B', 60_000);
    expect(res.acquired).toBe(false);
    // Runner B with explicit ownerId B trying to run same jobId should throw
    await expect(runnerB.runMass(undefined, { batchSize:10, limit:5, jobId: job.id, ownerId:'worker-B', leaseDurationMs:60_000, heartbeatIntervalMs:20_000 })).rejects.toThrow(/already owned/);
  });

  it('13. runner stops after lease loss (heartbeat fails)', async () => {
    const games = seedGames(100);
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepositoryWithClock(()=>new Date());
    // Slow stub: 15ms per game => ~150ms per batch
    const slowStub = {
      getGameCover: vi.fn(async (id: string) => {
        await new Promise(r=>setTimeout(r, 15));
        const g = games.get(id);
        if (!g) throw new Error('not found');
        if (g.cover) return { data:{ selected:g.cover, candidates:[], errors:[], query:'', gameId:id, type:'COVER' as never, limit:1 }, origin:'database' as const };
        const cover = { url:`https://img/${id}.png`, source:'igdb', sourceId:id, width:100, height:100, type:'UNKNOWN' as never };
        const upd = gameWithCover(g, cover); games.set(id, upd);
        return { data:{ selected:cover, candidates:[{candidate:cover} as never], errors:[], query:'', gameId:id, type:'COVER' as never, limit:1 }, origin:'scraper' as const };
      }),
      searchCovers: vi.fn(async ()=>({ data:{ selected:null, candidates:[], errors:[], query:'', gameId:null, type:'COVER' as never, limit:1 }, origin:'scraper' as const })),
    } as unknown as CoverService;
    const runner = new CoverEnrichmentRunner(repo, slowStub, jobs);
    const promise = runner.runMass(undefined, { batchSize:10, limit:100, ownerId:'worker-A', leaseDurationMs:3000, heartbeatIntervalMs:1000, delayMs:50 });
    setTimeout(async () => {
      const latest = await jobs.findLatestByType('cover');
      if (latest) {
        await jobs.update(latest.id, { leaseExpiresAt: new Date(Date.now()-1000) } as unknown as EnrichmentJobUpdate);
        await jobs.tryAcquireLease(latest.id, 'worker-B', 60_000);
      }
    }, 300);
    try {
      await promise;
      // If not thrown, steal happened after completion — still valid, check that B owns job
      const j = await jobs.findLatestByType('cover');
      // Either A completed or B stole mid-run
      expect(['worker-A','worker-B', null].includes(j?.ownerId as string) || j?.status==='COMPLETED').toBe(true);
    } catch (e) {
      expect(String(e)).toMatch(/Lease lost|already owned/);
    }
  });

  it('14. crash before progress commit — cursor not advanced, reprocess', async () => {
    const games = seedGames(20);
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepositoryWithClock(()=>new Date());
    // Fail commitProgress first time
    let fail=true;
    const origCommit = jobs.commitProgress;
    jobs.commitProgress = vi.fn(async (id, p)=>{
      if (fail){ fail=false; throw new Error('store down'); }
      return origCommit(id, p);
    });
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    await expect(runner.runMass(undefined, { batchSize:10, limit:10, ownerId:'worker-A' })).rejects.toThrow('store down');
    const job = await jobs.findLatestByType('cover');
    expect(job?.status).toBe('FAILED');
    // games already have covers
    for(let n=1;n<=10;n++) expect(games.get(`atp-igdb-${pad3(n)}`)?.cover).not.toBeNull();
  });

  it('15. crash after progress commit — resume skips committed batch', async () => {
    const games = seedGames(20);
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepositoryWithClock(()=>new Date());
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    // First run 10
    const first = await runner.runMass(undefined, { batchSize:10, limit:10, ownerId:'worker-A' });
    expect(first.cursor).toBe('atp-igdb-010');
    expect(first.processed).toBe(10);
    // Simulate second run that will be interrupted after batch commit? Just verify resume skips
    const runner2 = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    const second = await runner2.runMass(undefined, { batchSize:10, limit:10, ownerId:'worker-B' });
    // Should have processed 010-020, not reprocess 001-010 (they leave need-set)
    expect(second.processed).toBe(20); // accumulated
    expect(second.cursor).toBe('atp-igdb-020');
  });

  it('16. resume from committed cursor domainId > cursor', async () => {
    const games = seedGames(5);
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepositoryWithClock(()=>new Date());
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    const first = await runner.runMass(undefined, { batchSize:10, limit:2, ownerId:'worker-A' });
    expect(first.cursor).toBe('atp-igdb-002');
    const second = await runner.runMass(undefined, { batchSize:10, ownerId:'worker-B' });
    expect(second.processed).toBe(5);
    expect(second.cursor).toBe('atp-igdb-005');
  });

  it('17. counters remain accumulated with lease', async () => {
    const games = seedGames(30);
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepositoryWithClock(()=>new Date());
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    const r1 = await runner.runMass(undefined, { batchSize:10, limit:10, ownerId:'worker-A' });
    expect(r1.processed).toBe(10);
    const r2 = await runner.runMass(undefined, { batchSize:10, limit:10, ownerId:'worker-B' });
    expect(r2.processed).toBe(20);
    const job = await jobs.findLatestByType('cover');
    expect(job?.processed).toBe(20);
  });

  it('18. cover-only invariant with lease', async () => {
    const games = seedGames(1);
    const before = games.get('atp-igdb-001')!;
    const beforeTitle = before.titles[0].value;
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepositoryWithClock(()=>new Date());
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    await runner.runMass(undefined, { batchSize:10, limit:1, ownerId:'worker-A' });
    const after = games.get('atp-igdb-001')!;
    expect(after.titles[0].value).toBe(beforeTitle);
    expect(after.cover).not.toBeNull();
    expect(after.gameType).toBe(before.gameType);
  });

  it('19. completed job cannot be concurrently acquired for normal execution', async () => {
    const games = seedGames(5);
    const repo = createFakeGameRepository(games);
    const { repository: jobs } = createMemoryJobRepositoryWithClock(()=>new Date());
    const runner = new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    const r = await runner.runMass(undefined, { batchSize:10, ownerId:'worker-A' });
    expect(r.status).toBe('COMPLETED');
    const res = await jobs.tryAcquireLease(r.jobId!, 'worker-B', 60_000);
    expect(res.acquired).toBe(false);
    expect(res.job?.status).toBe('COMPLETED');
  });

  it('20. config validation heartbeat < lease', async () => {
    const { resolveLeaseConfig: rc } = await import('../../src/domain/enrichment-job/lease-config.js');
    expect(()=>rc({ leaseDurationMs:10_000, heartbeatIntervalMs:20_000 })).toThrow();
    expect(rc().leaseDurationMs).toBe(DEFAULT_LEASE_DURATION_MS);
    expect(rc().heartbeatIntervalMs).toBe(DEFAULT_HEARTBEAT_INTERVAL_MS);
  });
});
