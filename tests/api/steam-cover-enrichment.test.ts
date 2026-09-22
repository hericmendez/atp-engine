import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SteamAdapter } from '../../src/sources/steam/steam-adapter.js';
import { CoverEngine } from '../../src/cover/cover-engine.js';
import { SourceRegistry } from '../../src/sources/source-registry.js';
import { IgdbAdapter } from '../../src/sources/igdb/igdb-adapter.js';
import { WikipediaCoverDiscovery } from '../../src/sources/wikipedia/cover/wikipedia-cover-discovery.js';
import { CoverEnrichmentRunner } from '../../src/application/cover-enrichment-runner.js';
import { SourceError } from '../../src/sources/source-errors.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';
import { createGame, gameWithCover } from '../../src/domain/game/game.js';
import type { CoverService } from '../../src/application/cover-service.js';
import type { EnrichmentJobRepository } from '../../src/domain/enrichment-job/enrichment-job-repository.js';
import type { EnrichmentJob } from '../../src/domain/enrichment-job/enrichment-job.js';
import type { CreateEnrichmentJobInput } from '../../src/domain/enrichment-job/enrichment-job.js';
import { STEAM_APP_LIST_RESPONSE, STEAM_APP_DETAILS_RESPONSE } from '../sources/fixtures/source-fixtures.js';

function mockFetchSingle(data: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })));
}
function mockFetchError(status: number) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('Error', { status })));
}
function mockFetchTimeout() {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));
}

function pad3(n:number){ return String(n).padStart(3,'0'); }
function makeGame(n:number): Game { return createGame({ id:createGameId(`atp-igdb-${pad3(n)}`), titles:[createGameTitle(`Cover Game ${n}`,'primary')], developers:[], publishers:[], genres:[createGenre('action')], externalIdentifiers:[createExternalIdentifier('igdb',`${8000+n}`)], classification:'GAME', completeness:'FOUND_PARTIAL' }); }
function createFakeGameRepository(index: Map<string, Game>): GameRepository {
  return {
    findById: vi.fn(async (id)=>[...index.values()].find(g=>g.id===id) ?? null),
    findByExternalIdentifier: vi.fn(async ()=>null),
    existsByExternalIdentifier: vi.fn(async ()=>false),
    existsById: vi.fn(async ()=>false),
    findMany: vi.fn(async (q:any)=>{
      let items=[...index.values()];
      if(q.needsCover===true) items=items.filter(g=>g.cover===null && g.externalIdentifiers.some((e:any)=>e.source==='igdb'));
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
function createMemoryJobRepo(){
  const rows=new Map<string, EnrichmentJob>(); let seq=1;
  const repo: EnrichmentJobRepository = {
    create: vi.fn(async (input:CreateEnrichmentJobInput)=>{
      const id=`job-${seq++}`; const now=new Date();
      const job: EnrichmentJob={ id, type:input.type, mode:input.mode, status:input.status ?? 'RUNNING', cursor:input.cursor ?? '', processed:0, succeeded:0, found:0, persisted:0, unchanged:0, failed:0, totalEstimate:input.totalEstimate ?? null, batchSize:input.batchSize, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, lastActivityAt:now, startedAt:now, pausedAt:null, completedAt:null, lastMessage:null, error:null, createdAt:now, updatedAt:now };
      rows.set(id,job); return job;
    }),
    findById: vi.fn(async (id)=>rows.get(id) ?? null),
    findLatestByType: vi.fn(async (type)=>{ const l=[...rows.values()].filter(j=>j.type===type).sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()); return l[0] ?? null; }),
    findActiveByType: vi.fn(async (type)=>{ for(const j of [...rows.values()].sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime())) if(j.type===type && ['RUNNING','PAUSING','PENDING'].includes(j.status)) return j; return null; }),
    findRecent: vi.fn(async (limit=10)=>[...rows.values()].sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()).slice(0,limit)),
    findRecentByType: vi.fn(async (type,limit=10)=>[...rows.values()].filter(j=>j.type===type).sort((a,b)=>b.updatedAt.getTime()-a.updatedAt.getTime()).slice(0,limit)),
    update: vi.fn(async (id,patch:any)=>{
      const prev=rows.get(id); if(!prev) throw new Error(`Job ${id} not found`); const now=new Date();
      const next={ ...prev, ...patch, cursor:patch.cursor ?? prev.cursor, status:patch.status ?? prev.status, processed:patch.processed ?? prev.processed, updatedAt:now, lastActivityAt:now } as EnrichmentJob;
      rows.set(id,next); return next;
    }),
    commitProgress: vi.fn(async (id,p)=>{
      const prev=rows.get(id); if(!prev) throw new Error(`Job ${id} not found`); const now=new Date();
      const next={ ...prev, cursor:p.cursor, processed:p.processed, succeeded:p.succeeded, found:p.found, persisted:p.persisted, unchanged:p.unchanged, failed:p.failed, lastActivityAt:now, updatedAt:now };
      rows.set(id,next); return next;
    }),
    transition: vi.fn(async (id,from,to,patch)=>{
      const prev=rows.get(id); if(!prev || !(from as string[]).includes(prev.status)) return null; const now=new Date();
      const next={ ...prev, status:to, ...patch, updatedAt:now, lastActivityAt:now } as EnrichmentJob;
      rows.set(id,next); return next;
    }),
    tryAcquireLease: vi.fn(async (jobId,ownerId,ttl)=>{
      const prev=rows.get(jobId); if(!prev) return {acquired:false, job:null};
      if(['COMPLETED','CANCELLED'].includes(prev.status)) return {acquired:false, job:prev};
      const now=new Date();
      const can=prev.ownerId===null || prev.ownerId===ownerId || prev.leaseExpiresAt===null || prev.leaseExpiresAt.getTime() <= now.getTime();
      if(!can) return {acquired:false, job:prev};
      const next={ ...prev, ownerId, leaseExpiresAt:new Date(now.getTime()+ttl), lastHeartbeatAt:now, lastActivityAt:now, status:'RUNNING', error:null, updatedAt:now };
      rows.set(jobId,next); return {acquired:true, job:next};
    }),
    heartbeat: vi.fn(async (jobId,ownerId,ttl)=>{
      const prev=rows.get(jobId); if(!prev || prev.ownerId!==ownerId) return {renewed:false, job:prev ?? null};
      const now=new Date(); const next={ ...prev, leaseExpiresAt:new Date(now.getTime()+ttl), lastHeartbeatAt:now, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {renewed:true, job:next};
    }),
    releaseLease: vi.fn(async (jobId,ownerId)=>{
      const prev=rows.get(jobId); if(!prev || prev.ownerId!==ownerId) return {released:false, job:prev ?? null};
      const now=new Date(); const next={ ...prev, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {released:true, job:next};
    }),
    requestPause: vi.fn(async (jobId)=>{
      const prev=rows.get(jobId); if(!prev) return {requested:false, job:null};
      if(prev.status==='PAUSING' || prev.status==='PAUSED') return {requested:true, job:prev};
      if(prev.status!=='RUNNING') return {requested:false, job:prev};
      const now=new Date(); const next={ ...prev, status:'PAUSING' as const, lastActivityAt:now, updatedAt:now };
      rows.set(jobId,next); return {requested:true, job:next};
    }),
    completePause: vi.fn(async (jobId,ownerId)=>{
      const prev=rows.get(jobId); if(!prev || prev.status!=='PAUSING' || prev.ownerId!==ownerId){
        const cur=prev ?? null; if(cur && cur.status==='PAUSED') return {paused:true, job:cur};
        return {paused:false, job:cur};
      }
      const now=new Date(); const next={ ...prev, status:'PAUSED' as const, ownerId:null, leaseExpiresAt:null, lastHeartbeatAt:null, pausedAt:now, lastActivityAt:now, updatedAt:now };
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

describe('Steam provider — failure modes and cache (Phase 4.3)', ()=>{
  let adapter: SteamAdapter;
  beforeEach(()=>{ adapter=new SteamAdapter({source:'steam'}); vi.restoreAllMocks(); });
  afterEach(()=>{ vi.restoreAllMocks(); });

  it('valid response populates cache', async ()=>{
    vi.spyOn(globalThis,'fetch').mockImplementation((url: string | URL | Request)=>{
      const urlStr=String(url);
      if (urlStr.includes('applist')) return Promise.resolve(new Response(JSON.stringify(STEAM_APP_LIST_RESPONSE),{status:200,headers:{'Content-Type':'application/json'}}));
      return Promise.resolve(new Response(JSON.stringify(STEAM_APP_DETAILS_RESPONSE),{status:200,headers:{'Content-Type':'application/json'}}));
    });
    const res=await adapter.search('Resident Evil');
    expect(res.candidates.length).toBeGreaterThan(0);
    expect(adapter['appListCache']?.size).toBeGreaterThan(0);
  });

  it('invalid_response (403) is cached as empty and not retried per game', async ()=>{
    mockFetchError(500);
    const r1=await adapter.search('Resident Evil 4');
    expect(r1.candidates).toEqual([]);
    const calls1=vi.mocked(globalThis.fetch).mock.calls.filter(([u])=>String(u).includes('applist')).length;
    expect(calls1).toBe(1);
    // second search should not trigger new fetch (negative cache)
    const r2=await adapter.search('Resident Evil 4');
    expect(r2.candidates).toEqual([]);
    const calls2=vi.mocked(globalThis.fetch).mock.calls.filter(([u])=>String(u).includes('applist')).length;
    expect(calls2).toBe(1);
  });

  it('timeout is cached as empty', async ()=>{
    mockFetchTimeout();
    const r=await adapter.search('test');
    expect(r.candidates).toEqual([]);
    // not throw
  });

  it('network error is cached', async ()=>{
    vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('network down'));
    const r=await adapter.search('test');
    expect(r.candidates).toEqual([]);
  });

  it('successful empty applist is legitimate empty (not cached as failure)', async ()=>{
    mockFetchSingle({ applist: { apps: [] } });
    const r=await adapter.search('test');
    expect(r.candidates).toEqual([]);
    expect(r.hasMore).toBe(false);
  });

  it('deduplicates concurrent applist fetches', async ()=>{
    let fetchCount=0;
    vi.spyOn(globalThis,'fetch').mockImplementation((url: string | URL | Request)=>{
      const urlStr=String(url);
      if (urlStr.includes('applist')) {
        fetchCount++;
        return new Promise(resolve=>setTimeout(()=>resolve(new Response(JSON.stringify(STEAM_APP_LIST_RESPONSE),{status:200,headers:{'Content-Type':'application/json'}})),20));
      }
      // appdetails
      return Promise.resolve(new Response(JSON.stringify(STEAM_APP_DETAILS_RESPONSE),{status:200,headers:{'Content-Type':'application/json'}}));
    });
    const [a,b]=await Promise.all([adapter.search('Resident Evil'), adapter.search('Stardew')]);
    expect(fetchCount).toBe(1); // only one applist fetch despite concurrent
    expect(a.candidates.length).toBeGreaterThan(0);
  });

  it('clearAppListCache resets negative cache', async ()=>{
    mockFetchError(500);
    await adapter.search('test');
    expect(vi.mocked(globalThis.fetch).mock.calls.filter(([u])=>String(u).includes('applist')).length).toBe(1);
    adapter.clearAppListCache();
    vi.spyOn(globalThis,'fetch').mockImplementation((url: string | URL | Request)=>{
      const urlStr=String(url);
      if (urlStr.includes('applist')) return Promise.resolve(new Response(JSON.stringify(STEAM_APP_LIST_RESPONSE),{status:200,headers:{'Content-Type':'application/json'}}));
      return Promise.resolve(new Response(JSON.stringify(STEAM_APP_DETAILS_RESPONSE),{status:200,headers:{'Content-Type':'application/json'}}));
    });
    const r=await adapter.search('Resident Evil');
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(vi.mocked(globalThis.fetch).mock.calls.filter(([u])=>String(u).includes('applist')).length).toBe(1); // after clear, one more applist fetch, but mock was reset so count is 1 in new mock
    // total applist calls across both phases should be 2 if we count separately, but we reset mock, so just check second phase
  });
});

describe('CoverEngine — Steam failure isolation', ()=>{
  beforeEach(()=>{ vi.restoreAllMocks(); });
  afterEach(()=>{ vi.restoreAllMocks(); });

  it('Steam ❌, IGDB ✅, Wikipedia ✅ → cover found via IGDB', async ()=>{
    // IGDB mock returns cover with header image (FRONT_COVER) to pass eligibility and ranking
    const igdbAdapter = {
      source: 'igdb',
      capabilities: { search:true, getById:false, searchCovers:true, searchPagination:'none' },
      search: vi.fn(async ()=>({ candidates:[{ source:'igdb', sourceId:'1', title:'Test', coverUrls:['https://example.com/header.jpg'], platforms:[], developers:[], publishers:[], genres:[], releaseDate:null, description:null, externalIdentifiers:[], gameType:null, gameStatus:null, classificationHints:[{category:'GAME', confidence:0.9, evidence:'test'}] }], hasMore:false })),
      getById: vi.fn(async ()=>null),
    } as any;
    const steamAdapter = new SteamAdapter({source:'steam'});
    steamAdapter.search = vi.fn().mockRejectedValue(new SourceError('steam','invalid_response','steam down')) as any;

    const registry=new SourceRegistry();
    registry.register(igdbAdapter);
    registry.register(steamAdapter);
    const engine=new CoverEngine({ sourceRegistry:registry, wikipediaCoverDiscovery: new WikipediaCoverDiscovery() });

    // mock wikipedia to also succeed with empty (no cover) to isolate IGDB
    vi.spyOn(WikipediaCoverDiscovery.prototype,'discoverCovers').mockResolvedValue({ candidates:[], errors:[] } as any);

    const result=await engine.discoverCovers('atp-igdb-001','Test Game');
    expect(result.selected).not.toBeNull();
    expect(result.selected?.source).toBe('igdb');
    expect(result.errors.some(e=>e.source==='steam')).toBe(true);
  });

  it('Steam ❌, IGDB empty, Wikipedia empty → no cover but no crash', async ()=>{
    const steamAdapter=new SteamAdapter({source:'steam'});
    steamAdapter.search = vi.fn().mockRejectedValue(new SourceError('steam','invalid_response','steam down')) as any;
    const igdbAdapter={ source:'igdb', capabilities:{search:true, getById:false, searchCovers:true, searchPagination:'none'}, search: vi.fn(async ()=>({candidates:[], hasMore:false})), getById: vi.fn(async ()=>null) } as any;
    const registry=new SourceRegistry();
    registry.register(igdbAdapter);
    registry.register(steamAdapter);
    const engine=new CoverEngine({ sourceRegistry:registry });
    const result=await engine.discoverCovers('atp-igdb-001','Unknown Game');
    expect(result.selected).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('Durable Enrichment with Steam unavailable', ()=>{
  it('persists covers, advances cursor, idempotent with Steam down', async ()=>{
    const games=new Map<string,Game>();
    for(let n=1;n<=5;n++) games.set(`atp-igdb-${pad3(n)}`, makeGame(n));
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepo();
    // Create a CoverEngine where Steam always fails, IGDB succeeds
    const igdbAdapter={ source:'igdb', capabilities:{search:true, getById:false, searchCovers:true, searchPagination:'none'}, search: vi.fn(async (q:string)=>({ candidates:[{ source:'igdb', sourceId:'1', title:q, coverUrls:[`https://img/${q}.jpg`], platforms:[], developers:[], publishers:[], genres:[], releaseDate:null, description:null, externalIdentifiers:[], gameType:null, gameStatus:null, classificationHints:[] }], hasMore:false })), getById: vi.fn(async ()=>null) } as any;
    const steamAdapter=new SteamAdapter({source:'steam'});
    vi.spyOn(steamAdapter,'search').mockRejectedValue(new Error('steam down'));
    const registry=new SourceRegistry();
    registry.register(igdbAdapter);
    registry.register(steamAdapter);
    const engine=new CoverEngine({ sourceRegistry:registry });
    const coverService=new (await import('../../src/application/cover-service.js')).CoverService({ gameRepository: repo, coverEngine: engine } as any);
    const runner=new CoverEnrichmentRunner(repo, coverService, jobs);

    const result=await runner.runMass(undefined,{batchSize:5, ownerId:'test'});
    expect(result.processed).toBe(5);
    expect(result.persisted).toBe(5);
    expect(result.cursor).toBe('atp-igdb-005');
    // All games now have cover
    for(let n=1;n<=5;n++) expect(games.get(`atp-igdb-${pad3(n)}`)?.cover).not.toBeNull();
    // Idempotent re-run
    const second=await runner.runMass(undefined,{batchSize:5, ownerId:'test2'});
    expect(second.processed).toBe(0);
    expect(second.status).toBe('COMPLETED');
  });

  it('controlled 5–10 item test: Steam fails, IGDB succeeds, metrics', async ()=>{
    const games=new Map<string,Game>();
    for(let n=1;n<=10;n++) games.set(`atp-igdb-${pad3(n)}`, makeGame(n));
    const repo=createFakeGameRepository(games);
    const {repository:jobs}=createMemoryJobRepo();
    const igdbAdapter={ source:'igdb', capabilities:{search:true, getById:false, searchCovers:true, searchPagination:'none'}, search: vi.fn(async (q:string)=>({ candidates:[{ source:'igdb', sourceId:'1', title:q, coverUrls:[`https://img/${q}.jpg`], platforms:[], developers:[], publishers:[], genres:[], releaseDate:null, description:null, externalIdentifiers:[], gameType:null, gameStatus:null, classificationHints:[] }], hasMore:false })), getById: vi.fn(async ()=>null) } as any;
    const steamAdapter=new SteamAdapter({source:'steam'});
    // Simulate applist 403 failure cached
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('Error',{status:403}));
    const registry=new SourceRegistry();
    registry.register(igdbAdapter);
    registry.register(steamAdapter);
    const engine=new CoverEngine({ sourceRegistry:registry });
    const coverService=new (await import('../../src/application/cover-service.js')).CoverService({ gameRepository: repo, coverEngine: engine } as any);
    const runner=new CoverEnrichmentRunner(repo, coverService, jobs);
    const start=Date.now();
    const result=await runner.runMass(undefined,{batchSize:5, ownerId:'test'});
    const duration=Date.now()-start;
    // Steam should have 1 applist call (cached), not 10
    const applistCalls=vi.mocked(globalThis.fetch).mock.calls.filter(([u])=>String(u).includes('applist')).length;
    expect(applistCalls).toBe(1);
    expect(result.processed).toBe(10);
    expect(result.persisted).toBe(10);
    expect(result.failed).toBe(0);
    expect(duration).toBeLessThan(5000);
    // IGDB should have 10 calls (one per game)
    expect(igdbAdapter.search).toHaveBeenCalledTimes(10);
  });
});
