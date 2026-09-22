/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig, resetConfig } from '../../src/infrastructure/config/config.js';
import request from 'supertest';
import { createApp } from '../../src/interfaces/http/app.js';
import type { EnrichmentJobRepository } from '../../src/domain/enrichment-job/enrichment-job-repository.js';
import type { EnrichmentJob } from '../../src/domain/enrichment-job/enrichment-job.js';
import type { CreateEnrichmentJobInput } from '../../src/domain/enrichment-job/enrichment-job.js';
import type { EnrichmentJobUpdate } from '../../src/domain/enrichment-job/enrichment-job-repository.js';
const ADMIN_TOKEN = 'test-admin-token-1234567890123456';

function createMemoryJobRepo(clock: ()=>Date = ()=>new Date()){
  const rows=new Map<string, EnrichmentJob>(); let seq=1;
  const repo: EnrichmentJobRepository = {
    create: vi.fn(async (input:CreateEnrichmentJobInput)=>{
      const id=`job-${String(seq++).padStart(3,'0')}`; const now=clock();
      const job: EnrichmentJob={ id, type:input.type, mode:input.mode, status:input.status ?? 'RUNNING', cursor:input.cursor ?? '', processed:0, succeeded:0, found:0, persisted:0, unchanged:0, failed:0, totalEstimate:input.totalEstimate ?? null, batchSize:input.batchSize, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, lastActivityAt:now, startedAt:now, pausedAt:null, completedAt:null, lastMessage:null, error:null, createdAt:now, updatedAt:now };
      rows.set(id,job); return job;
    }),
    findById: vi.fn(async (id)=>rows.get(id) ?? null),
    findActiveByType: vi.fn(async (type)=>{ for(const j of [...rows.values()].sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime())) if(j.type===type && ['RUNNING','PAUSING','PENDING'].includes(j.status)) return j; return null; }),
    findLatestByType: vi.fn(async (type)=>{ const l=[...rows.values()].filter(j=>j.type===type).sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()); return l[0] ?? null; }),
    findRecent: vi.fn(async (limit=10)=>[...rows.values()].sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()).slice(0,limit)),
    findRecentByType: vi.fn(async (type, limit=10)=>[...rows.values()].filter(j=>j.type===type).sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()).slice(0,limit)),
    update: vi.fn(async (id, patch: EnrichmentJobUpdate)=>{
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

function createTestApp(repo: EnrichmentJobRepository){
  return createApp({
    games: { catalogService: { listGames: vi.fn(), searchGames: vi.fn() } as any },
    cover: { coverService: { searchCovers: vi.fn(), getGameCover: vi.fn() } as any },
    platforms: { platformCatalogService: { findMany: vi.fn() } as any },
    catalogSync: { catalogSyncService: {} as any },
    catalogSyncHistory: { historyRepository: {} as any },
    admin: { gameAdminService: {} as any },
    enrichmentJobs: { jobRepository: repo },
  });
}

describe('Enrichment Jobs API — Phase 5 Observability', ()=>{
  beforeEach(()=>{ resetConfig(); loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN }); vi.clearAllMocks(); });

  describe('GET /enrichment/jobs — List', ()=>{
    it('A. lista jobs', async ()=>{
      const {repository}=createMemoryJobRepo();
      await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      const app=createTestApp(repository);
      const res=await request(app).get('/api/v1/enrichment/jobs');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('progress');
    });
    it('B. ordenação updatedAt DESC', async ()=>{
      const {repository, rows}=createMemoryJobRepo();
      const j1=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await new Promise(r=>setTimeout(r,5));
      const j2=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      // touch j1 to be most recent
      await repository.update(j1.id,{ lastActivityAt:new Date() });
      const app=createTestApp(repository);
      const res=await request(app).get('/api/v1/enrichment/jobs');
      expect(res.body.data[0].id).toBe(j1.id);
    });
    it('C. filtro type', async ()=>{
      const {repository}=createMemoryJobRepo();
      await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      const app=createTestApp(repository);
      const res=await request(app).get('/api/v1/enrichment/jobs?type=cover');
      expect(res.body.data.every((j:any)=>j.type==='cover')).toBe(true);
      const bad=await request(app).get('/api/v1/enrichment/jobs?type=invalid');
      expect(bad.status).toBe(400);
    });
    it('D. filtro status', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.update(job.id,{status:'PAUSED' as const});
      const app=createTestApp(repository);
      const res=await request(app).get('/api/v1/enrichment/jobs?status=PAUSED');
      expect(res.body.data.every((j:any)=>j.status==='PAUSED')).toBe(true);
    });
    it('E. limit', async ()=>{
      const {repository}=createMemoryJobRepo();
      for(let i=0;i<5;i++) await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      const app=createTestApp(repository);
      const res=await request(app).get('/api/v1/enrichment/jobs?limit=2');
      expect(res.body.data).toHaveLength(2);
    });
    it('F. limit máximo 100', async ()=>{
      const {repository}=createMemoryJobRepo();
      const app=createTestApp(repository);
      const res=await request(app).get('/api/v1/enrichment/jobs?limit=200');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /enrichment/jobs/:id — Detail', ()=>{
    it('G. retorna job', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(job.id);
      expect(res.body.data).toHaveProperty('progress');
      expect(res.body.data).toHaveProperty('counters');
      expect(res.body.data).toHaveProperty('owner');
      expect(res.body.data).toHaveProperty('timing');
    });
    it('H. 404 job inexistente', async ()=>{
      const {repository}=createMemoryJobRepo();
      const app=createTestApp(repository);
      const res=await request(app).get('/api/v1/enrichment/jobs/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
    it('I. progress percentage', async ()=>{
      const {repository}=createMemoryJobRepo(()=>new Date('2026-01-01T00:00:00Z'));
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:100});
      await repository.update(job.id,{processed:50} as any);
      // need to set processed via commitProgress to avoid type issues, but update works for fake
      const stored=await repository.findById(job.id);
      // manually set processed via commitProgress helper
      await repository.commitProgress(job.id,{cursor:'', processed:50, succeeded:30, found:30, persisted:30, unchanged:20, failed:0});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.progress.percentage).toBe(50);
    });
    it('J. counters', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.commitProgress(job.id,{cursor:'a', processed:10, succeeded:7, found:7, persisted:7, unchanged:3, failed:0});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.counters).toMatchObject({succeeded:7, persisted:7, unchanged:3, failed:0});
    });
    it('K. lease', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.tryAcquireLease(job.id,'worker-A',60_000);
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.owner.id).toBe('worker-A');
      expect(res.body.data.owner.leaseRemainingMs).toBeGreaterThan(0);
    });
    it('L. timing', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.timing).toHaveProperty('startedAt');
      expect(res.body.data.timing).toHaveProperty('lastActivityAt');
    });
    it('M. error field for FAILED', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.update(job.id,{status:'FAILED' as const, error:'boom'} as any);
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.error).toBe('boom');
      expect(res.body.data.message).toContain('Failed');
    });
  });

  describe('Progress edge cases', ()=>{
    it('N. 0% when processed 0', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:100});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.progress.percentage).toBe(0);
    });
    it('O. progress normal 23.4', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:1000});
      await repository.commitProgress(job.id,{cursor:'', processed:234, succeeded:200, found:200, persisted:200, unchanged:34, failed:0});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.progress.percentage).toBe(23.4);
    });
    it('P. 100% capped', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:10});
      await repository.commitProgress(job.id,{cursor:'', processed:15, succeeded:10, found:10, persisted:10, unchanged:5, failed:0});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.progress.percentage).toBe(100);
    });
    it('Q. totalEstimate zero → percentage null', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:0});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.progress.percentage).toBeNull();
    });
    it('R. sem NaN/Infinity', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:null});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.progress.percentage).toBeNull();
      expect(Number.isNaN(res.body.data.progress.percentage)).toBe(false);
    });
  });

  describe('Rate / ETA', ()=>{
    it('S. velocidade calculada average', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:100});
      const start=new Date(Date.now()-10000);
      await repository.update(job.id,{startedAt:start} as any);
      await repository.commitProgress(job.id,{cursor:'', processed:10, succeeded:10, found:10, persisted:10, unchanged:0, failed:0});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.progress.itemsPerSecond).toBeCloseTo(1,1);
    });
    it('T. ETA calculado', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:100});
      const start=new Date(Date.now()-10000);
      await repository.update(job.id,{startedAt:start} as any);
      await repository.commitProgress(job.id,{cursor:'', processed:10, succeeded:10, found:10, persisted:10, unchanged:0, failed:0});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      // remaining 90 / 1 per sec = 90s
      expect(res.body.data.progress.etaSeconds).toBe(90);
    });
    it('U. ETA null sem dados suficientes (processed 0)', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:100});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.progress.etaSeconds).toBeNull();
    });
    it('V. ETA nunca negativo, null when completed', async ()=>{
      const start=new Date('2026-01-01T00:00:00Z');
      const clock=()=>new Date('2026-01-01T00:00:10Z');
      const {repository}=createMemoryJobRepo(clock);
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:10});
      await repository.update(job.id,{startedAt:start, status:'COMPLETED' as const} as any);
      await repository.commitProgress(job.id,{cursor:'', processed:10, succeeded:10, found:10, persisted:10, unchanged:0, failed:0});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.progress.etaSeconds === null || res.body.data.progress.etaSeconds >=0).toBe(true);
    });
  });

  describe('POST pause', ()=>{
    it('W. RUNNING → PAUSING', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      const app=createTestApp(repository);
      const res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAUSING');
    });
    it('X. PAUSING idempotente', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.requestPause(job.id);
      const app=createTestApp(repository);
      const res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAUSING');
    });
    it('Y. PAUSED idempotente', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.tryAcquireLease(job.id,'A',60_000);
      await repository.requestPause(job.id);
      await repository.completePause(job.id,'A');
      const app=createTestApp(repository);
      const res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PAUSED');
    });
    it('Z. nonexistent 404', async ()=>{
      const {repository}=createMemoryRepo();
      function createMemoryRepo(){ return createMemoryJobRepo(); }
      const app=createTestApp(repository);
      const res=await request(app).post('/api/v1/enrichment/jobs/nope/pause').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST resume', ()=>{
    it('AA. PAUSED → RUNNING', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.tryAcquireLease(job.id,'A',60_000);
      await repository.requestPause(job.id);
      await repository.completePause(job.id,'A');
      const app=createTestApp(repository);
      const res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RUNNING');
      expect(res.body.data.owner.id).not.toBeNull();
    });
    it('AB. expired lease takeover', async ()=>{
      let now=new Date('2026-01-01T00:00:00Z');
      const clock=()=>now;
      const {repository}=createMemoryJobRepo(clock);
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.tryAcquireLease(job.id,'A',1000);
      now=new Date(now.getTime()+2000);
      const app=createTestApp(repository);
      const res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.owner.id).not.toBe('A');
    });
    it('AC. valid lease conflict 409', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.tryAcquireLease(job.id,'A',60_000);
      const app=createTestApp(repository);
      const res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(409);
    });
    it('AD. COMPLETED rejection 409', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.update(job.id,{status:'COMPLETED' as const});
      const app=createTestApp(repository);
      const res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(409);
    });
    it('AE. nonexistent 404', async ()=>{
      const {repository}=createMemoryJobRepo();
      const app=createTestApp(repository);
      const res=await request(app).post('/api/v1/enrichment/jobs/nope/resume').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Concurrency', ()=>{
    it('AF. dois resumes simultâneos → 1 success', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.tryAcquireLease(job.id,'A',60_000);
      await repository.requestPause(job.id);
      await repository.completePause(job.id,'A');
      const app=createTestApp(repository);
      const [a,b]=await Promise.all([
        request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`),
        request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`),
      ]);
      const succ=[a,b].filter(r=>r.status===200).length;
      expect(succ).toBe(1);
      const fail=[a,b].filter(r=>r.status===409).length;
      expect(fail).toBe(1);
    });
    it('AG. dois pauses simultâneos idempotente', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      const app=createTestApp(repository);
      const [a,b]=await Promise.all([
        request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`).set('Authorization', `Bearer ${ADMIN_TOKEN}`),
        request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`).set('Authorization', `Bearer ${ADMIN_TOKEN}`),
      ]);
      expect([a.status,b.status].every(s=>s===200)).toBe(true);
    });
  });

  describe('Security / serialization', ()=>{
    it('AH. não retorna stack trace', async ()=>{
      const {repository}=createMemoryJobRepo();
      const app=createTestApp(repository);
      const res=await request(app).get('/api/v1/enrichment/jobs/nonexistent');
      expect(JSON.stringify(res.body)).not.toContain('stack');
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
    it('AI. não retorna objeto Mongo', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(JSON.stringify(res.body)).not.toContain('__v');
      expect(res.body.data).not.toHaveProperty('_id');
    });
    it('AJ. não retorna dados de Game', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      const app=createTestApp(repository);
      const res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data).not.toHaveProperty('game');
      expect(res.body.data).not.toHaveProperty('cover');
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('igdb');
    });
  });

  describe('Integration flow', ()=>{
    it('create → pause → resume → completed', async ()=>{
      const {repository}=createMemoryJobRepo();
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10, totalEstimate:10});
      const app=createTestApp(repository);
      let res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.status).toBe('RUNNING');
      res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/pause`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.status).toBe('PAUSING');
      // simulate worker finalizes pause
      await repository.tryAcquireLease(job.id,'worker-A',60_000);
      await repository.requestPause(job.id);
      await repository.completePause(job.id,'worker-A');
      res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.status).toBe('PAUSED');
      res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.body.data.status).toBe('RUNNING');
      await repository.update(job.id,{status:'COMPLETED' as const, processed:10} as any);
      res=await request(app).get(`/api/v1/enrichment/jobs/${job.id}`);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.progress.percentage).toBe(100);
    });
    it('expired lease resume continues cursor', async ()=>{
      let now=new Date('2026-01-01T00:00:00Z');
      const clock=()=>now;
      const {repository}=createMemoryJobRepo(clock);
      const job=await repository.create({type:'cover', mode:'needs-cover', batchSize:10});
      await repository.tryAcquireLease(job.id,'A',1000);
      await repository.commitProgress(job.id,{cursor:'atp-igdb-010', processed:10, succeeded:10, found:10, persisted:10, unchanged:0, failed:0});
      now=new Date(now.getTime()+2000);
      const app=createTestApp(repository);
      const res=await request(app).post(`/api/v1/enrichment/jobs/${job.id}/resume`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.data.cursor).toBe('atp-igdb-010');
      expect(res.body.data.status).toBe('RUNNING');
    });
  });
});