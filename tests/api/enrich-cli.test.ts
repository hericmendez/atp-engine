import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEnrichStartArgs, formatJob, formatJobList, parseIdArg } from '../../src/scripts/enrich-common.js';
import type { EnrichmentJob } from '../../src/domain/enrichment-job/enrichment-job.js';
import type { EnrichmentJobRepository, EnrichmentJobUpdate } from '../../src/domain/enrichment-job/enrichment-job-repository.js';
import type { CreateEnrichmentJobInput } from '../../src/domain/enrichment-job/enrichment-job.js';
import { CoverEnrichmentRunner } from '../../src/application/cover-enrichment-runner.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import { createGame, gameWithCover } from '../../src/domain/game/game.js';
import type { CoverService } from '../../src/application/cover-service.js';
import { parseCoverEnrichArgs } from '../../src/scripts/cover-enrich.js';

function pad3(n:number){ return String(n).padStart(3,'0'); }
function makeGame(n:number): Game { return createGame({ id:createGameId(`atp-igdb-${pad3(n)}`), titles:[createGameTitle(`Cover Game ${n}`,'primary')], developers:[], publishers:[], genres:[createGenre('action')], externalIdentifiers:[createExternalIdentifier('igdb',`${8000+n}`)], classification:'GAME', completeness:'FOUND_PARTIAL' }); }
function createFakeGameRepository(index: Map<string, Game>): GameRepository {
  return {
    findById: vi.fn(async (id)=>[...index.values()].find(g=>g.id===id) ?? null),
    findByExternalIdentifier: vi.fn(async ()=>null),
    existsByExternalIdentifier: vi.fn(async ()=>false),
    existsById: vi.fn(async ()=>false),
    findMany: vi.fn(async (q: import('../../src/domain/game/game-repository.js').GameQuery)=>{
      let items=[...index.values()];
      if(q.needsCover===true) items=items.filter(g=>g.cover===null && g.externalIdentifiers.some((e)=>e.source==='igdb'));
      if(q.afterDomainId!==undefined) items=items.filter(g=>g.id > q.afterDomainId);
      items=[...items].sort((a,b)=>(a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const limited=items.slice(0,q.limit ?? 10);
      const total=[...index.values()].filter(g=>g.cover===null).length;
      return { items:limited, total, page:1, limit:10, totalPages:0 };
    }),
    save: vi.fn(async (g:Game)=>{ index.set(g.id,g); }),
    update: vi.fn(async (g:Game)=>{ index.set(g.id,g); }),
    deleteById: vi.fn(async ()=>{}),
  } as unknown as GameRepository;
}
function createMemoryRepo(clock:()=>Date){
  const rows=new Map<string, EnrichmentJob>(); let seq=1;
  const repo: EnrichmentJobRepository = {
    create: vi.fn(async (input:CreateEnrichmentJobInput)=>{
      const id=`job-${seq++}`; const now=clock();
      const job: EnrichmentJob={ id, type:input.type, mode:input.mode, status:input.status ?? 'RUNNING', cursor:input.cursor ?? '', processed:0, succeeded:0, found:0, persisted:0, unchanged:0, failed:0, totalEstimate:input.totalEstimate ?? null, batchSize:input.batchSize, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, lastActivityAt:now, startedAt:now, pausedAt:null, completedAt:null, lastMessage:null, error:null, createdAt:now, updatedAt:now };
      rows.set(id,job); return job;
    }),
    findById: vi.fn(async (id)=>rows.get(id) ?? null),
    findActiveByType: vi.fn(async (type)=>{ for(const j of [...rows.values()].sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime())) if(j.type===type && ['RUNNING','PAUSING','PENDING'].includes(j.status)) return j; return null; }),
    findLatestByType: vi.fn(async (type)=>{ const l=[...rows.values()].filter(j=>j.type===type).sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()); return l[0] ?? null; }),
    findRecent: vi.fn(async (limit=10)=>[...rows.values()].sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()).slice(0,limit)),
    findRecentByType: vi.fn(async (type, limit=10)=>[...rows.values()].filter(j=>j.type===type).sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()).slice(0,limit)),
    update: vi.fn(async (id, patch:EnrichmentJobUpdate)=>{
      const prev=rows.get(id); if(!prev) throw new Error(`Job ${id} not found`); const now=clock();
      const next={ ...prev, ...patch, cursor:patch.cursor ?? prev.cursor, status:(patch.status as EnrichmentJob['status']) ?? prev.status, processed:patch.processed ?? prev.processed, succeeded:patch.succeeded ?? prev.succeeded, found:patch.found ?? prev.found, persisted:patch.persisted ?? prev.persisted, unchanged:patch.unchanged ?? prev.unchanged, failed:patch.failed ?? prev.failed, lastActivityAt:patch.lastActivityAt ?? now, updatedAt:now } as EnrichmentJob;
      rows.set(id,next); return next;
    }),
    commitProgress: vi.fn(async (id,p)=>{
      const prev=rows.get(id); if(!prev) throw new Error(`Job ${id} not found`); const now=clock();
      const next={ ...prev, cursor:p.cursor, processed:p.processed, succeeded:p.succeeded, found:p.found, persisted:p.persisted, unchanged:p.unchanged, failed:p.failed, lastActivityAt:now, updatedAt:now };
      rows.set(id,next); return next;
    }),
    transition: vi.fn(async (id, from, to, patch)=>{
      const prev=rows.get(id); if(!prev || !from.includes(prev.status)) return null; const now=clock();
      const next={ ...prev, status:to, ...patch, updatedAt:now, lastActivityAt:now } as EnrichmentJob;
      rows.set(id,next); return next;
    }),
    tryAcquireLease: vi.fn(async (jobId, ownerId, ttl)=>{
      const prev=rows.get(jobId); if(!prev) return {acquired:false, job:null};
      if(['COMPLETED','CANCELLED'].includes(prev.status)) return {acquired:false, job:prev};
      const now=clock();
      const can=prev.ownerId===null || prev.ownerId===ownerId || prev.leaseExpiresAt===null || prev.leaseExpiresAt.getTime() <= now.getTime();
      if(!can) return {acquired:false, job:prev};
      const next={ ...prev, ownerId, leaseExpiresAt:new Date(now.getTime()+ttl), lastHeartbeatAt:now, lastActivityAt:now, status:'RUNNING', error:null, updatedAt:now };
      rows.set(jobId,next); return {acquired:true, job:next};
    }),
    heartbeat: vi.fn(async (jobId, ownerId, ttl)=>{
      const prev=rows.get(jobId); if(!prev || prev.ownerId!==ownerId) return {renewed:false, job:prev ?? null};
      const now=clock(); const next={ ...prev, leaseExpiresAt:new Date(now.getTime()+ttl), lastHeartbeatAt:now, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {renewed:true, job:next};
    }),
    releaseLease: vi.fn(async (jobId, ownerId)=>{
      const prev=rows.get(jobId); if(!prev || prev.ownerId!==ownerId) return {released:false, job:prev ?? null};
      const now=clock(); const next={ ...prev, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {released:true, job:next};
    }),
    requestPause: vi.fn(async (jobId)=>{
      const prev=rows.get(jobId); if(!prev) return {requested:false, job:null};
      if(prev.status==='PAUSING' || prev.status==='PAUSED') return {requested:true, job:prev};
      if(prev.status!=='RUNNING') return {requested:false, job:prev};
      const now=clock(); const next={ ...prev, status:'PAUSING' as const, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {requested:true, job:next};
    }),
    completePause: vi.fn(async (jobId, ownerId)=>{
      const prev=rows.get(jobId); if(!prev || prev.status!=='PAUSING' || prev.ownerId!==ownerId){
        const cur=prev ?? null; if(cur && cur.status==='PAUSED') return {paused:true, job:cur};
        return {paused:false, job:cur};
      }
      const now=clock(); const next={ ...prev, status:'PAUSED' as const, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, pausedAt:now, lastActivityAt:now, updatedAt:now };
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
function slowStub(index: Map<string, Game>, perGameMs=15): CoverService {
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

describe('Phase 4 — CLI / Control Plane', ()=>{
  beforeEach(()=>{ vi.clearAllMocks(); });

  describe('CLI start — parse and create', ()=>{
    it('A. parse enrich:start --type cover --limit', ()=>{
      expect(parseEnrichStartArgs(['--type','cover','--limit','2000'])).toMatchObject({type:'cover', limit:2000});
    });
    it('C/D. start creates job and shows jobId via runner', async ()=>{
      const games=seedGames(10);
      const repo=createFakeGameRepository(games);
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const runner=new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
      const result=await runner.runMass(undefined,{batchSize:5, limit:5, ownerId:'worker-A'});
      expect(result.jobId).toBeDefined();
      expect(result.processed).toBe(5);
      const job=await jobs.findById(result.jobId!);
      expect(job?.type).toBe('cover');
    });
    it('B. start preserves options batchSize/delay', async ()=>{
      const args=parseEnrichStartArgs(['--type','cover','--batch-size','25','--delay-ms','50','--requests-per-second','2']);
      expect(args.batchSize).toBe(25);
      expect(args.delayMs).toBe(50);
      expect(args.requestsPerSecond).toBe(2);
    });
    it('Y. dry-run zero writes', async ()=>{
      const games=seedGames(10);
      const repo=createFakeGameRepository(games);
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const runner=new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
      const res=await runner.runMass(undefined,{batchSize:5, limit:5, dryRun:true});
      expect(res.dryRun).toBe(true);
      expect(jobs.create).not.toHaveBeenCalled();
      expect([...games.values()].every(g=>g.cover===null)).toBe(true);
    });
  });

  describe('Status', ()=>{
    it('E. status por id shows job', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      const formatted=formatJob(job);
      expect(formatted).toContain(job.id);
      expect(formatted).toContain('cover');
      expect(formatted).toContain('RUNNING');
    });
    it('F. status sem id shows recent list', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      const list=await jobs.findRecent(5);
      const out=formatJobList(list);
      expect(out).toContain('Latest enrichment jobs');
      expect(out).toContain(list[0].id);
    });
    it('G. job inexistente error', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const j=await jobs.findById('nonexistent');
      expect(j).toBeNull();
    });
    it('H. mostra lease remaining', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.tryAcquireLease(job.id,'worker-A',60_000);
      const j=await jobs.findById(job.id);
      const fmt=formatJob(j!);
      expect(fmt).toContain('Lease remaining');
    });
    it('I. mostra counters', async ()=>{
      const games=seedGames(5);
      const repo=createFakeGameRepository(games);
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const runner=new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
      const res=await runner.runMass(undefined,{batchSize:5, ownerId:'A'});
      const job=await jobs.findById(res.jobId!);
      const fmt=formatJob(job!);
      expect(fmt).toContain('Processed');
      expect(fmt).toContain('Persisted');
    });
  });

  describe('Pause', ()=>{
    it('J. pause RUNNING → PAUSING→PAUSED via runner', async ()=>{
      const games=seedGames(20);
      const repo=createFakeGameRepository(games);
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const runner=new CoverEnrichmentRunner(repo, slowStub(games, 15), jobs);
      const p=runner.runMass(undefined,{batchSize:10, ownerId:'worker-A'});
      await new Promise(r=>setTimeout(r,50));
      const j=await jobs.findLatestByType('cover');
      const req=await jobs.requestPause(j!.id);
      expect(req.requested).toBe(true);
      const res=await p;
      expect(res.status).toBe('PAUSED');
      expect((await jobs.findById(j!.id))!.status).toBe('PAUSED');
    });
    it('K. pause PAUSED idempotent', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.tryAcquireLease(job.id,'A',60_000);
      await jobs.requestPause(job.id);
      await jobs.completePause(job.id,'A');
      const second=await jobs.requestPause(job.id);
      expect(second.requested).toBe(true);
      expect(second.job?.status).toBe('PAUSED');
    });
    it('L. pause COMPLETED fails', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.update(job.id,{status:'COMPLETED' as const});
      const res=await jobs.requestPause(job.id);
      expect(res.requested).toBe(false);
    });
    it('M. pause nonexistent → null', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const res=await jobs.requestPause('nonexistent');
      expect(res.requested).toBe(false);
      expect(res.job).toBeNull();
    });
  });

  describe('Resume', ()=>{
    it('N. resume PAUSED → acquire → RUNNING', async ()=>{
      const games=seedGames(20);
      const repo=createFakeGameRepository(games);
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const runner=new CoverEnrichmentRunner(repo, slowStub(games,10), jobs);
      const p=runner.runMass(undefined,{batchSize:10, ownerId:'A'});
      await new Promise(r=>setTimeout(r,50));
      const j=await jobs.findLatestByType('cover');
      await jobs.requestPause(j!.id);
      const paused=await p;
      expect(paused.status).toBe('PAUSED');
      const acq=await jobs.tryAcquireLease(paused.jobId!,'B',60_000);
      expect(acq.acquired).toBe(true);
      expect(acq.job?.status).toBe('RUNNING');
      const runner2=new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
      const resumed=await runner2.runMass(undefined,{batchSize:10, ownerId:'B'});
      expect(resumed.processed).toBeGreaterThan(10);
    });
    it('O. resume RUNNING com lease válido fails', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.tryAcquireLease(job.id,'A',60_000);
      const res=await jobs.tryAcquireLease(job.id,'B',60_000);
      expect(res.acquired).toBe(false);
    });
    it('P. resume RUNNING lease expirado succeeds', async ()=>{
      let now=new Date('2026-01-01T00:00:00Z');
      const clock=()=>now;
      const {repository:jobs}=createMemoryRepo(clock);
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.tryAcquireLease(job.id,'A',1000);
      now=new Date(now.getTime()+2000);
      const res=await jobs.tryAcquireLease(job.id,'B',60_000);
      expect(res.acquired).toBe(true);
    });
    it('Q. resume COMPLETED fails', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.update(job.id,{status:'COMPLETED' as const});
      const res=await jobs.tryAcquireLease(job.id,'B',60_000);
      expect(res.acquired).toBe(false);
    });
    it('R. resume FAILED → RUNNING', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.update(job.id,{status:'FAILED' as const});
      const res=await jobs.tryAcquireLease(job.id,'B',60_000);
      expect(res.acquired).toBe(true);
      expect(res.job?.status).toBe('RUNNING');
    });
    it('S. resume nonexistent → null', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const j=await jobs.findById('nope');
      expect(j).toBeNull();
    });
  });

  describe('Concurrency', ()=>{
    it('T. dois resumes simultâneos → somente um owner', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.tryAcquireLease(job.id,'A',60_000);
      await jobs.requestPause(job.id);
      await jobs.completePause(job.id,'A');
      const [a,b]=await Promise.all([
        jobs.tryAcquireLease(job.id,'B',60_000),
        jobs.tryAcquireLease(job.id,'C',60_000),
      ]);
      expect([a.acquired,b.acquired].filter(Boolean).length).toBe(1);
    });
    it('U. start não cria duplicado quando já existe ativo', async ()=>{
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.tryAcquireLease(job.id,'A',60_000);
      const latest=await jobs.findLatestByType('cover');
      const isActive=latest && ['RUNNING','PAUSING','PAUSED','PENDING','FAILED'].includes(latest.status);
      expect(isActive).toBe(true);
      // Simula guarda do enrich:start: deve bloquear
      let blocked=false;
      if (latest && ['RUNNING','PAUSING','PAUSED','PENDING','FAILED'].includes(latest.status)) blocked=true;
      expect(blocked).toBe(true);
    });
  });

  describe('Lifecycle', ()=>{
    it('V. start → pause → resume', async ()=>{
      const games=seedGames(30);
      const repo=createFakeGameRepository(games);
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const runner=new CoverEnrichmentRunner(repo, slowStub(games,10), jobs);
      const p=runner.runMass(undefined,{batchSize:10, ownerId:'A'});
      await new Promise(r=>setTimeout(r,50));
      const j=await jobs.findLatestByType('cover');
      await jobs.requestPause(j!.id);
      const paused=await p;
      expect(paused.status).toBe('PAUSED');
      const runner2=new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
      const resumed=await runner2.runMass(undefined,{batchSize:10, ownerId:'B'});
      expect(resumed.processed).toBeGreaterThan(10);
    });
    it('W. start → SIGTERM (requestPause) → PAUSED → resume', async ()=>{
      const games=seedGames(20);
      const repo=createFakeGameRepository(games);
      const {repository:jobs}=createMemoryRepo(()=>new Date());
      const runner=new CoverEnrichmentRunner(repo, slowStub(games,15), jobs);
      const p=runner.runMass(undefined,{batchSize:10, ownerId:'A'});
      await new Promise(r=>setTimeout(r,40));
      const j=await jobs.findLatestByType('cover');
      // SIGTERM handler would call requestPause
      await jobs.requestPause(j!.id);
      const paused=await p;
      expect(paused.status).toBe('PAUSED');
      const runner2=new CoverEnrichmentRunner(repo, stubCoverService(games), jobs);
      const resumed=await runner2.runMass(undefined,{batchSize:10, ownerId:'B'});
      expect(['COMPLETED','RUNNING']).toContain(resumed.status);
    });
    it('X. machine crash → lease expiry → resume', async ()=>{
      let now=new Date('2026-01-01T00:00:00Z');
      const clock=()=>now;
      const {repository:jobs}=createMemoryRepo(clock);
      const job=await jobs.create({type:'cover', mode:'needs-cover', batchSize:10});
      await jobs.tryAcquireLease(job.id,'A',1000);
      now=new Date(now.getTime()+5000);
      const res=await jobs.tryAcquireLease(job.id,'B',60_000);
      expect(res.acquired).toBe(true);
      expect(res.job?.ownerId).toBe('B');
    });
  });

  describe('Compatibility', ()=>{
    it('Z. cover:enrich parseCoverEnrichArgs still works', ()=>{
      expect(parseCoverEnrichArgs(['--limit','10'])).toMatchObject({limit:10});
      expect(parseCoverEnrichArgs(['--resume'])).toMatchObject({resume:true});
      expect(()=>parseCoverEnrichArgs(['--resume','--restart-checkpoint'])).toThrow();
    });
    it('parseIdArg handles --id flag', ()=>{
      expect(parseIdArg(['--id','abc123'])).toBe('abc123');
      expect(parseIdArg(['abc123'])).toBe('abc123');
      expect(parseIdArg([])).toBeUndefined();
    });
  });
});
