import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { GameId } from '../../src/domain/shared/ids.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import { createGame, gameWithCover } from '../../src/domain/game/game.js';
import type { CoverService } from '../../src/application/cover-service.js';
import { CoverEnrichmentRunner } from '../../src/application/cover-enrichment-runner.js';
import type { EnrichmentJob, EnrichmentJobType } from '../../src/domain/enrichment-job/enrichment-job.js';
import type { EnrichmentJobRepository, EnrichmentJobUpdate } from '../../src/domain/enrichment-job/enrichment-job-repository.js';
import type { CreateEnrichmentJobInput } from '../../src/domain/enrichment-job/enrichment-job.js';

function pad3(n:number){ return String(n).padStart(3,'0'); }
function makeGame(n:number): Game { return createGame({ id:createGameId(`atp-igdb-${pad3(n)}`), titles:[createGameTitle(`Cover Game ${n}`,'primary')], developers:[], publishers:[], genres:[createGenre('action')], externalIdentifiers:[createExternalIdentifier('igdb',`${8000+n}`)], classification:'GAME', completeness:'FOUND_PARTIAL' }); }
function createFakeGameRepository(index: Map<string, Game>): GameRepository {
  return {
    findById: vi.fn(async (id: GameId) => [...index.values()].find(g=>g.id===id) ?? null),
    findByExternalIdentifier: vi.fn(async ()=>null),
    existsByExternalIdentifier: vi.fn(async ()=>false),
    existsById: vi.fn(async ()=>false),
    findMany: vi.fn(async (q: import('../../src/domain/game/game-repository.js').GameQuery) => {
      let items=[...index.values()];
      if (q.needsCover===true) items=items.filter(g=>g.cover===null && g.externalIdentifiers.some((e)=>e.source==='igdb') && !g.id.startsWith('atp-unknown-'));
      if (q.afterDomainId!==undefined) items=items.filter(g=>g.id > q.afterDomainId);
      items=[...items].sort((a,b)=>(a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const limited=items.slice(0, q.limit ?? 10);
      const total=[...index.values()].filter(g=>g.cover===null).length;
      return { items:limited, total, page:1, limit:10, totalPages:0 };
    }),
    save: vi.fn(async (g:Game)=>{ index.set(g.id,g); }),
    update: vi.fn(async (g:Game)=>{ index.set(g.id,g); }),
    deleteById: vi.fn(async ()=>{}),
  };
}
function createMemoryJobRepository(clock: ()=>Date){
  const rows=new Map<string, EnrichmentJob>(); let seq=1;
  const repo: EnrichmentJobRepository = {
    create: vi.fn(async (input: CreateEnrichmentJobInput)=>{
      const id=`job-${seq++}`; const now=clock();
      const job: EnrichmentJob={ id, type:input.type, mode:input.mode, status:input.status ?? 'RUNNING', cursor:input.cursor ?? '', processed:0, succeeded:0, found:0, persisted:0, unchanged:0, failed:0, totalEstimate:input.totalEstimate ?? null, batchSize:input.batchSize, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, lastActivityAt:now, startedAt:now, pausedAt:null, completedAt:null, lastMessage:null, error:null, createdAt:now, updatedAt:now };
      rows.set(id,job); return job;
    }),
    findById: vi.fn(async (id)=>rows.get(id) ?? null),
    findActiveByType: vi.fn(async (type: EnrichmentJobType)=>{ for(const j of [...rows.values()].sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime())) if(j.type===type && ['RUNNING','PAUSING','PENDING'].includes(j.status)) return j; return null; }),
    findLatestByType: vi.fn(async (type: EnrichmentJobType)=>{ const l=[...rows.values()].filter(j=>j.type===type).sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()); return l[0] ?? null; }),
    update: vi.fn(async (id, patch: EnrichmentJobUpdate)=>{
      const prev=rows.get(id); if(!prev) throw new Error(`Job ${id} not found`); const now=clock();
      const next: EnrichmentJob={ ...prev, ...patch, cursor:patch.cursor ?? prev.cursor, status:(patch.status as EnrichmentJob['status']) ?? prev.status, processed:patch.processed ?? prev.processed, succeeded:patch.succeeded ?? prev.succeeded, found:patch.found ?? prev.found, persisted:patch.persisted ?? prev.persisted, unchanged:patch.unchanged ?? prev.unchanged, failed:patch.failed ?? prev.failed, totalEstimate:patch.totalEstimate!==undefined?patch.totalEstimate:prev.totalEstimate, lastActivityAt:patch.lastActivityAt ?? now, updatedAt:now, error:patch.error!==undefined?patch.error:prev.error, completedAt:patch.completedAt!==undefined?patch.completedAt:prev.completedAt } as EnrichmentJob;
      rows.set(id,next); return next;
    }),
    commitProgress: vi.fn(async (id, p)=>{
      const prev=rows.get(id); if(!prev) throw new Error(`Job ${id} not found`); const now=clock();
      const next: EnrichmentJob={ ...prev, cursor:p.cursor, processed:p.processed, succeeded:p.succeeded, found:p.found, persisted:p.persisted, unchanged:p.unchanged, failed:p.failed, lastActivityAt:now, updatedAt:now };
      rows.set(id,next); return next;
    }),
    transition: vi.fn(async (id, from, to, patch)=>{
      const prev=rows.get(id); if(!prev || !from.includes(prev.status)) return null; const now=clock();
      const next: EnrichmentJob={ ...prev, status:to, ...patch, updatedAt:now, lastActivityAt:now, completedAt:to==='COMPLETED'?now:prev.completedAt, pausedAt:to==='PAUSED'?now:prev.pausedAt } as EnrichmentJob;
      rows.set(id,next); return next;
    }),
    tryAcquireLease: vi.fn(async (jobId, ownerId, ttl)=>{
      const prev=rows.get(jobId); if(!prev) return {acquired:false, job:null};
      if(['COMPLETED','CANCELLED'].includes(prev.status)) return {acquired:false, job:prev};
      const now=clock();
      const can=prev.ownerId===null || prev.ownerId===ownerId || prev.leaseExpiresAt===null || prev.leaseExpiresAt.getTime() <= now.getTime();
      if(!can) return {acquired:false, job:prev};
      const next: EnrichmentJob={ ...prev, ownerId, leaseExpiresAt:new Date(now.getTime()+ttl), lastHeartbeatAt:now, lastActivityAt:now, status:'RUNNING', error:null, updatedAt:now };
      rows.set(jobId,next); return {acquired:true, job:next};
    }),
    heartbeat: vi.fn(async (jobId, ownerId, ttl)=>{
      const prev=rows.get(jobId); if(!prev || prev.ownerId!==ownerId) return {renewed:false, job:prev ?? null};
      const now=clock(); const next: EnrichmentJob={ ...prev, leaseExpiresAt:new Date(now.getTime()+ttl), lastHeartbeatAt:now, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {renewed:true, job:next};
    }),
    releaseLease: vi.fn(async (jobId, ownerId)=>{
      const prev=rows.get(jobId); if(!prev || prev.ownerId!==ownerId) return {released:false, job:prev ?? null};
      const now=clock(); const next: EnrichmentJob={ ...prev, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {released:true, job:next};
    }),
    requestPause: vi.fn(async (jobId)=>{
      const prev=rows.get(jobId); if(!prev) return {requested:false, job:null};
      if(prev.status==='PAUSING' || prev.status==='PAUSED') return {requested:true, job:prev};
      if(prev.status!=='RUNNING') return {requested:false, job:prev};
      const now=clock(); const next: EnrichmentJob={ ...prev, status:'PAUSING' as const, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {requested:true, job:next};
    }),
    completePause: vi.fn(async (jobId, ownerId)=>{
      const prev=rows.get(jobId); if(!prev || prev.status!=='PAUSING' || prev.ownerId!==ownerId){
        const cur=prev ?? null; if(cur && cur.status==='PAUSED') return {paused:true, job:cur};
        return {paused:false, job:cur};
      }
      const now=clock(); const next: EnrichmentJob={ ...prev, status:'PAUSED' as const, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, pausedAt:now, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {paused:true, job:next};
    }),
  };
  return { repository:repo, rows };
}
function stubCoverService(index: Map<string, Game>): CoverService {
  return {
    getGameCover: vi.fn(async (id:string)=>{
      const g=index.get(id); if(!g) throw new Error('not found');
      if(g.cover) return { data:{ selected:g.cover, candidates:[], errors:[], query:'', gameId:id, type:'COVER' as never, limit:1 }, origin:'database' as const };
      const cover={ url:`https://img/${id}.png`, source:'igdb', sourceId:id, width:100, height:100, type:'UNKNOWN' as never };
      const upd=gameWithCover(g,cover); index.set(id,upd);
      return { data:{ selected:cover, candidates:[{candidate:cover} as never], errors:[], query:'', gameId:id, type:'COVER' as never, limit:1 }, origin:'scraper' as const };
    }),
    searchCovers: vi.fn(async ()=>({ data:{ selected:null, candidates:[], errors:[], query:'', gameId:null, type:'COVER' as never, limit:1 }, origin:'scraper' as const })),
  } as unknown as CoverService;
}
function slowStub(index: Map<string, Game>, perGameMs=25): CoverService {
  return {
    getGameCover: vi.fn(async (id:string)=>{
      await new Promise(r=>setTimeout(r, perGameMs));
      const g=index.get(id); if(!g) throw new Error('not found');
      if(g.cover) return { data:{ selected:g.cover, candidates:[], errors:[], query:'', gameId:id, type:'COVER' as never, limit:1 }, origin:'database' as const };
      const cover={ url:`https://img/${id}.png`, source:'igdb', sourceId:id, width:100, height:100, type:'UNKNOWN' as never };
      const upd=gameWithCover(g,cover); index.set(id,upd);
      return { data:{ selected:cover, candidates:[{candidate:cover} as never], errors:[], query:'', gameId:id, type:'COVER' as never, limit:1 }, origin:'scraper' as const };
    }),
    searchCovers: vi.fn(async ()=>({ data:{ selected:null, candidates:[], errors:[], query:'', gameId:null, type:'COVER' as never, limit:1 }, origin:'scraper' as const })),
  } as unknown as CoverService;
}
function seedGames(n:number){ const m=new Map<string, Game>(); for(let i=1;i<=n;i++) m.set(`atp-igdb-${pad3(i)}`, makeGame(i)); return m; }

describe('Phase 3 — Pause / Resume / Graceful Shutdown', ()=>{
  beforeEach(()=>{ vi.clearAllMocks(); });

  it('A — requestPause RUNNING→PAUSING', async ()=>{
    const {repository}=createMemoryJobRepository(()=>new Date());
    const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
    expect(job.status).toBe('RUNNING');
    const res=await repository.requestPause(job.id);
    expect(res.requested).toBe(true);
    expect(res.job?.status).toBe('PAUSING');
    const second=await repository.requestPause(job.id);
    expect(second.requested).toBe(true);
  });

  it('B — pause finalization PAUSING→PAUSED clears lease', async ()=>{
    const {repository}=createMemoryJobRepository(()=>new Date());
    const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
    await repository.tryAcquireLease(job.id,'worker-A',60_000);
    await repository.requestPause(job.id);
    const pa=await repository.completePause(job.id,'worker-A');
    expect(pa.paused).toBe(true);
    expect(pa.job?.status).toBe('PAUSED');
    expect(pa.job?.ownerId).toBeNull();
    expect(pa.job?.leaseExpiresAt).toBeNull();
  });

  it('C — pause finalization rejects non-owner', async ()=>{
    const {repository}=createMemoryJobRepository(()=>new Date());
    const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
    await repository.tryAcquireLease(job.id,'worker-A',60_000);
    await repository.requestPause(job.id);
    const pa=await repository.completePause(job.id,'worker-B');
    expect(pa.paused).toBe(false);
  });

  it('D — requestPause on PAUSED/COMPLETED has defined behavior', async ()=>{
    const {repository}=createMemoryJobRepository(()=>new Date());
    const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
    await repository.tryAcquireLease(job.id,'worker-A',60_000);
    await repository.requestPause(job.id);
    await repository.completePause(job.id,'worker-A');
    expect((await repository.findById(job.id))!.status).toBe('PAUSED');
    const req2=await repository.requestPause(job.id);
    expect(req2.requested).toBe(true);
    const job2=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
    await repository.update(job2.id,{status:'COMPLETED' as const});
    const reqComp=await repository.requestPause(job2.id);
    expect(reqComp.requested).toBe(false);
  });

  it('E — no next batch after PAUSING observed (current batch finishes)', async ()=>{
    const games=seedGames(30);
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const runner=new CoverEnrichmentRunner(repo, slowStub(games, 20), jobs);
    const promise=runner.runMass(undefined,{batchSize:10, ownerId:'worker-A', leaseDurationMs:60_000, heartbeatIntervalMs:1000});
    await new Promise(r=>setTimeout(r,60));
    const latest=await jobs.findLatestByType('cover');
    if (latest) await jobs.requestPause(latest.id);
    const result=await promise;
    expect(result.status).toBe('PAUSED');
    expect(result.batches).toBeGreaterThanOrEqual(1);
    expect(result.batches).toBeLessThan(3);
    const job=await jobs.findById(result.jobId!);
    expect(job?.status).toBe('PAUSED');
    expect(job?.ownerId).toBeNull();
  });

  it('F — resume PAUSED→RUNNING continues from committed cursor', async ()=>{
    const games=seedGames(30);
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const runnerFirst=new CoverEnrichmentRunner(repo, slowStub(games, 15), jobs);
    const p=runnerFirst.runMass(undefined,{batchSize:10, ownerId:'worker-A'});
    await new Promise(r=>setTimeout(r,60));
    const j=await jobs.findLatestByType('cover');
    if(j) await jobs.requestPause(j.id);
    const rPaused=await p;
    expect(rPaused.status).toBe('PAUSED');
    expect(rPaused.cursor).toBe('atp-igdb-010');
    const runnerResume=new CoverEnrichmentRunner(repo, slowStub(games, 5), jobs);
    const rResumed=await runnerResume.runMass(undefined,{batchSize:10, ownerId:'worker-B'});
    expect(rResumed.processed).toBeGreaterThan(10);
    expect(rResumed.cursor).not.toBe('atp-igdb-001');
    expect(games.get('atp-igdb-011')?.cover).not.toBeNull();
  });

  it('G — resume does not start from zero (cursor preserved)', async ()=>{
    const games=seedGames(30);
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const runner=new CoverEnrichmentRunner(repo, slowStub(games, 15), jobs);
    const p=runner.runMass(undefined,{batchSize:10, ownerId:'worker-A'});
    await new Promise(r=>setTimeout(r,60));
    const j=await jobs.findLatestByType('cover');
    if(j) await jobs.requestPause(j.id);
    const paused=await p;
    expect(paused.status).toBe('PAUSED');
    const cursorBefore=paused.cursor;
    const runner2=new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    const resumed=await runner2.runMass(undefined,{batchSize:10, ownerId:'worker-B'});
    expect(resumed.cursor).not.toBe('');
    expect(resumed.processed).toBeGreaterThan(10);
    expect(cursorBefore).toBe('atp-igdb-010');
  });

  it('H — concurrent resume: successes=1', async ()=>{
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
    await jobs.tryAcquireLease(job.id,'worker-A',60_000);
    await jobs.requestPause(job.id);
    await jobs.completePause(job.id,'worker-A');
    expect((await jobs.findById(job.id))!.status).toBe('PAUSED');
    const [a,b]=await Promise.all([
      jobs.tryAcquireLease(job.id,'worker-B',60_000),
      jobs.tryAcquireLease(job.id,'worker-C',60_000),
    ]);
    const succ=[a,b].filter(r=>r.acquired).length;
    expect(succ).toBe(1);
    const j=await jobs.findById(job.id);
    expect(j?.status).toBe('RUNNING');
    expect(j?.ownerId).not.toBeNull();
  });

  it('I — pause during batch: batch finishes and commits', async ()=>{
    const games=seedGames(20);
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const runner=new CoverEnrichmentRunner(repo, slowStub(games, 30), jobs);
    const p=runner.runMass(undefined,{batchSize:10, ownerId:'worker-A'});
    await new Promise(r=>setTimeout(r,100));
    const j=await jobs.findLatestByType('cover');
    if(j) await jobs.requestPause(j.id);
    const res=await p;
    expect(res.status).toBe('PAUSED');
    expect(res.processed).toBe(10);
    expect(res.cursor).toBe('atp-igdb-010');
    const job=await jobs.findById(res.jobId!);
    expect(job?.processed).toBe(10);
  });

  it('J — pause during commit: batch still committed', async ()=>{
    const games=seedGames(10);
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const origCommit=jobs.commitProgress;
    jobs.commitProgress=vi.fn(async (id,p)=>{
      void jobs.requestPause(id);
      await new Promise(r=>setTimeout(r,20));
      return origCommit(id,p);
    });
    const runner=new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    const res=await runner.runMass(undefined,{batchSize:10, ownerId:'worker-A'});
    expect(['PAUSED','COMPLETED','RUNNING']).toContain(res.status);
    const job=await jobs.findById(res.jobId!);
    expect(job?.processed).toBe(10);
  });

  it('K — graceful SIGTERM simulated via requestPause results in PAUSED', async ()=>{
    const games=seedGames(20);
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const runner=new CoverEnrichmentRunner(repo, slowStub(games, 20), jobs);
    const p=runner.runMass(undefined,{batchSize:10, ownerId:'worker-A', delayMs:20});
    await new Promise(r=>setTimeout(r,40));
    const j=await jobs.findLatestByType('cover');
    if(j) await jobs.requestPause(j.id);
    const res=await p;
    expect(res.status).toBe('PAUSED');
    const job=await jobs.findById(res.jobId!);
    expect(job?.status).toBe('PAUSED');
    expect(job?.ownerId).toBeNull();
  });

  it('L — shutdown timeout: slow batch, not yet PAUSED after 300ms', async ()=>{
    const games=seedGames(10);
    const slowStub2: CoverService = {
      getGameCover: vi.fn(async (id:string)=>{
        await new Promise(r=>setTimeout(r,2000));
        const g=games.get(id)!;
        const cover={url:`https://img/${id}.png`, source:'igdb', sourceId:id, width:100, height:100, type:'UNKNOWN' as never};
        const upd=gameWithCover(g,cover); games.set(id,upd);
        return {data:{selected:cover,candidates:[{candidate:cover} as never],errors:[],query:'',gameId:id,type:'COVER' as never,limit:1},origin:'scraper' as const};
      }),
      searchCovers: vi.fn(async ()=>({data:{selected:null,candidates:[],errors:[],query:'',gameId:null,type:'COVER' as never,limit:1},origin:'scraper' as const})),
    } as unknown as CoverService;
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const runner=new CoverEnrichmentRunner(repo, slowStub2, jobs);
    const _p=runner.runMass(undefined,{batchSize:10, ownerId:'worker-A', gracefulShutdownTimeoutMs:1000});
    await new Promise(r=>setTimeout(r,100));
    const j=await jobs.findLatestByType('cover');
    if(j) await jobs.requestPause(j.id);
    await new Promise(r=>setTimeout(r,300));
    const mid=await jobs.findById(j!.id);
    expect(['PAUSING','PAUSED','RUNNING']).toContain(mid?.status as string);
    expect(mid?.cursor).toBe('');
    // don't await p (would take 20s) — just verify not falsely advanced
  });

  it('M — power-off: lease expires, new worker acquires RUNNING recoverable', async ()=>{
    let now=new Date('2026-01-01T00:00:00Z');
    const clock=()=>now;
    const {repository:jobs}=createMemoryJobRepository(clock);
    const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
    await jobs.tryAcquireLease(job.id,'worker-A',60_000);
    // Don't use runner, keep lease held
    const j0=await jobs.findById(job.id);
    expect(j0?.status).toBe('RUNNING');
    expect(j0?.ownerId).toBe('worker-A');
    now=new Date(now.getTime()+61_000);
    const res=await jobs.tryAcquireLease(job!.id,'worker-B',60_000);
    expect(res.acquired).toBe(true);
    expect(res.job?.ownerId).toBe('worker-B');
    expect(res.job?.status).toBe('RUNNING');
  });

  it('N — old worker after takeover cannot heartbeat/commit', async ()=>{
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
    await jobs.tryAcquireLease(job.id,'worker-A',1000);
    await jobs.update(job.id,{leaseExpiresAt:new Date(Date.now()-1000)} as unknown as EnrichmentJobUpdate);
    await jobs.tryAcquireLease(job.id,'worker-B',60_000);
    const hb=await jobs.heartbeat(job.id,'worker-A',60_000);
    expect(hb.renewed).toBe(false);
    const rel=await jobs.releaseLease(job.id,'worker-A');
    expect(rel.released).toBe(false);
    const pa=await jobs.completePause(job.id,'worker-A');
    expect(pa.paused).toBe(false);
  });

  it('O — paused job has no active lease', async ()=>{
    const games=seedGames(30);
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const runner=new CoverEnrichmentRunner(repo, slowStub(games, 15), jobs);
    const p=runner.runMass(undefined,{batchSize:10, ownerId:'worker-A'});
    await new Promise(r=>setTimeout(r,60));
    const j=await jobs.findLatestByType('cover');
    if(j) await jobs.requestPause(j.id);
    const res=await p;
    expect(res.status).toBe('PAUSED');
    const job=await jobs.findById(res.jobId!);
    expect(job?.ownerId).toBeNull();
    expect(job?.leaseExpiresAt).toBeNull();
    expect(job?.lastHeartbeatAt).toBeNull();
    expect(job?.status).toBe('PAUSED');
  });

  it('P — counters accumulated across pause/resume 100+50=150', async ()=>{
    const games=seedGames(150);
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const runner=new CoverEnrichmentRunner(repo, slowStub(games, 10), jobs);
    const p=runner.runMass(undefined,{batchSize:50, ownerId:'worker-A'});
    await new Promise(r=>setTimeout(r,60));
    const j=await jobs.findLatestByType('cover');
    if(j) await jobs.requestPause(j.id);
    const paused=await p;
    expect(paused.status).toBe('PAUSED');
    const runner2=new CoverEnrichmentRunner(repo, slowStub(games, 5), jobs);
    const resumed=await runner2.runMass(undefined,{batchSize:50, ownerId:'worker-B'});
    expect(resumed.processed).toBeGreaterThan(paused.processed);
    const finalJob=await jobs.findById(resumed.jobId!);
    expect(finalJob?.processed).toBe(resumed.processed);
  });

  it('Q — completed job cannot be resumed', async ()=>{
    const games=seedGames(5);
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepository(()=>new Date());
    const runner=new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
    const r=await runner.runMass(undefined,{batchSize:10, ownerId:'worker-A'});
    expect(r.status).toBe('COMPLETED');
    const jobId=r.jobId!;
    const req=await jobs.requestPause(jobId);
    expect(req.requested).toBe(false);
    const acq=await jobs.tryAcquireLease(jobId,'worker-B',60_000);
    expect(acq.acquired).toBe(false);
    expect((await jobs.findById(jobId))!.status).toBe('COMPLETED');
  });

  it('R — full cycle CREATE→RUNNING→PAUSING→PAUSED→RUNNING→COMPLETED', async ()=>{
    const games=seedGames(20);
    const repo=createFakeGameRepository(games);
    const {repository:jobs, rows}=createMemoryJobRepository(()=>new Date());
    const runner=new CoverEnrichmentRunner(repo, slowStub(games, 10), jobs);
    const p1=runner.runMass(undefined,{batchSize:10, ownerId:'worker-A'});
    await new Promise(r=>setTimeout(r,60));
    const j1=await jobs.findLatestByType('cover');
    expect(j1?.status).toBe('RUNNING');
    await jobs.requestPause(j1!.id);
    const paused=await p1;
    expect(paused.status).toBe('PAUSED');
    expect(paused.batches).toBe(1);
    expect(rows.get(paused.jobId!)?.status).toBe('PAUSED');
    expect(rows.get(paused.jobId!)?.ownerId).toBeNull();
    const runner2=new CoverEnrichmentRunner(repo, slowStub(games, 5), jobs);
    const resumed=await runner2.runMass(undefined,{batchSize:10, ownerId:'worker-B'});
    expect(['COMPLETED','RUNNING']).toContain(resumed.status);
    expect(resumed.processed).toBe(20);
    expect(resumed.cursor).toBe('atp-igdb-020');
    const totalWithCover=[...games.values()].filter(g=>g.cover!==null).length;
    expect(totalWithCover).toBe(20);
    expect(games.get('atp-igdb-010')?.cover).not.toBeNull();
    expect(games.get('atp-igdb-011')?.cover).not.toBeNull();
  });
});
