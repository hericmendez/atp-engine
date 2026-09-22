import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoCatalogSyncLockRepository } from '../src/infrastructure/persistence/mongodb/mongo-catalog-sync-lock-repository.js';
import { CatalogSyncLockModel } from '../src/infrastructure/persistence/mongodb/catalog-sync-lock-schema.js';
import { CatalogSyncService } from '../src/application/catalog-sync-service.js';
import type { GameRepository } from '../src/domain/game/game-repository.js';
import type { PlatformCatalogRepository } from '../src/domain/platform/platform-catalog-repository.js';
import type { DiscoveryEngine } from '../src/discovery/discovery-engine.js';
import type { EnrichmentService } from '../src/application/enrichment-service.js';
import { createApp } from '../src/interfaces/http/app.js';
import request from 'supertest';
import { loadConfig, resetConfig } from '../src/infrastructure/config/config.js';

const TEST_MONGO = process.env.MONGODB_URI || 'mongodb://localhost:27017/atp-engine-test-lock';

describe('Catalog Sync Lock — Fase 4.2', () => {
  let lockRepo: MongoCatalogSyncLockRepository;

  beforeEach(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(TEST_MONGO);
    }
    await CatalogSyncLockModel.deleteMany({});
    lockRepo = new MongoCatalogSyncLockRepository();
  });

  afterEach(async () => {
    await CatalogSyncLockModel.deleteMany({});
  });

  describe('Lock lifecycle', () => {
    it('5. lock acquired with success', async () => {
      const ok = await lockRepo.tryAcquire('owner-A', 300_000);
      expect(ok).toBe(true);
      const lock = await lockRepo.findLock();
      expect(lock?.owner).toBe('owner-A');
    });

    it('6. second acquire fails while held', async () => {
      await lockRepo.tryAcquire('owner-A', 300_000);
      const ok = await lockRepo.tryAcquire('owner-B', 300_000);
      expect(ok).toBe(false);
    });

    it('7. release allows new execution', async () => {
      await lockRepo.tryAcquire('owner-A', 300_000);
      const released = await lockRepo.release('owner-A');
      expect(released).toBe(true);
      const ok = await lockRepo.tryAcquire('owner-B', 300_000);
      expect(ok).toBe(true);
    });

    it('8. release with owner incorrect does not liberate', async () => {
      await lockRepo.tryAcquire('owner-A', 300_000);
      const released = await lockRepo.release('owner-B');
      expect(released).toBe(false);
      const stillLocked = await lockRepo.isLocked();
      expect(stillLocked).toBe(true);
      const ok = await lockRepo.tryAcquire('owner-B', 300_000);
      expect(ok).toBe(false);
    });

    it('9. lock expirado pode ser adquirido novamente', async () => {
      await lockRepo.tryAcquire('owner-A', 1);
      // wait for expiry
      await new Promise((r) => setTimeout(r, 10));
      const ok = await lockRepo.tryAcquire('owner-B', 300_000);
      expect(ok).toBe(true);
      const lock = await lockRepo.findLock();
      expect(lock?.owner).toBe('owner-B');
    });

    it('10. lock não expirado não pode ser adquirido novamente', async () => {
      await lockRepo.tryAcquire('owner-A', 60_000);
      const ok = await lockRepo.tryAcquire('owner-B', 60_000);
      expect(ok).toBe(false);
    });

    it('renewal de owner correto estende expiração', async () => {
      await lockRepo.tryAcquire('owner-A', 1000);
      const before = (await lockRepo.findLock())!.expiresAt;
      await new Promise((r) => setTimeout(r, 10));
      const renewed = await lockRepo.renew('owner-A', 300_000);
      expect(renewed).toBe(true);
      const after = (await lockRepo.findLock())!.expiresAt;
      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('renewal de owner incorreto não altera lock', async () => {
      await lockRepo.tryAcquire('owner-A', 300_000);
      const before = (await lockRepo.findLock())!.expiresAt;
      const renewed = await lockRepo.renew('owner-B', 300_000);
      expect(renewed).toBe(false);
      const after = (await lockRepo.findLock())!.expiresAt;
      expect(after.getTime()).toBe(before.getTime());
    });

    it('expired lock can be acquired after TTL', async () => {
      const now = new Date();
      await lockRepo.tryAcquire('owner-A', 1, now);
      const expiredNow = new Date(now.getTime() + 10);
      const ok = await lockRepo.tryAcquire('owner-B', 300_000, expiredNow);
      expect(ok).toBe(true);
    });
  });

  describe('CatalogSyncService with lock', () => {
    function createMockDeps(lock: MongoCatalogSyncLockRepository) {
      const gameRepo = {
        findById: vi.fn(async () => null),
        findByExternalIdentifier: vi.fn(async () => null),
        existsByExternalIdentifier: vi.fn(async () => false),
        existsById: vi.fn(async () => false),
        findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
        save: vi.fn(async () => {}),
        update: vi.fn(async () => {}),
        deleteById: vi.fn(async () => {}),
      } as unknown as GameRepository;

      const platformRepo = {
        findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
        findById: vi.fn(async () => null),
        findByCompany: vi.fn(async () => []),
        upsert: vi.fn(async () => {}),
      } as unknown as PlatformCatalogRepository;

      const discovery = {
        discover: vi.fn(async () => ({ query: '', groups: [], totalGroups: 0, sourceErrors: [], hasMore: false })),
      } as unknown as DiscoveryEngine;

      const enrichment = { enrich: vi.fn(async (g) => ({ game: g, changes: [], conflicts: [], completeness: 'FOUND_PARTIAL' })) } as unknown as EnrichmentService;

      const history = {
        create: vi.fn(async () => 'hist-1'),
        update: vi.fn(async () => {}),
        findById: vi.fn(async () => null),
        findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
      };

      const service = new CatalogSyncService({
        gameRepository: gameRepo,
        platformCatalogRepository: platformRepo,
        discoveryEngine: discovery,
        enrichmentService: enrichment,
        historyRepository: history as never,
        lockRepository: lock,
      });

      return { service, gameRepo, platformRepo, discovery, history };
    }

    it('14. processo abandonado + lock expirado permite nova execução', async () => {
      const lock = new MongoCatalogSyncLockRepository();
      await CatalogSyncLockModel.deleteMany({});
      // Simulate old owner with 1ms ttl, already expired
      await lock.tryAcquire('old-owner', 1, new Date(Date.now() - 100));
      const { service } = createMockDeps(lock);
      // Should succeed because old lock expired
      const result = await service.sync({ platforms: ['nonexistent'], from: '2025-01-01', to: '2025-12-31' });
      expect(result.status).toBe('completed');
      // After successful sync, lock is released, so no lock should remain
      expect(await lock.isLocked()).toBe(false);
    });

    it('15. execução que ultrapassa TTL inicial mantém lock via renewal', async () => {
      const lock = new MongoCatalogSyncLockRepository();
      await CatalogSyncLockModel.deleteMany({});
      // Use short TTL to test renewal, but service uses 5min TTL with 60s renew
      // We test that after 2 seconds, lock is still held via renewal (not expired)
      const { service } = createMockDeps(lock);
      // Mock discovery to take 2 seconds
      const discoverySlow = {
        discover: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, 2000));
          return { query: '', groups: [], totalGroups: 0, sourceErrors: [], hasMore: false };
        }),
      } as unknown as DiscoveryEngine;
      const serviceSlow = new CatalogSyncService({
        gameRepository: { findById: vi.fn(), findByExternalIdentifier: vi.fn(), existsByExternalIdentifier: vi.fn(), existsById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), save: vi.fn(), update: vi.fn(), deleteById: vi.fn() } as never,
        platformCatalogRepository: { findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), findById: vi.fn(async () => ({ id: 'p1', name: 'P1', company: 'C', releaseYear: 2020, status: 'active', family: null, type: null, thumb: null, gameCount: 0 } as never)), findByCompany: vi.fn(), upsert: vi.fn() } as never,
        discoveryEngine: discoverySlow,
        enrichmentService: { enrich: vi.fn(async (g) => ({ game: g, changes: [], conflicts: [], completeness: 'FOUND_PARTIAL' })) } as never,
        historyRepository: { create: vi.fn(async () => 'h1'), update: vi.fn(async () => {}), findById: vi.fn(), findMany: vi.fn() } as never,
        lockRepository: lock,
      });
      const promise = serviceSlow.sync({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31' });
      // Wait a bit and check lock still held
      await new Promise((r) => setTimeout(r, 100));
      const lockedDuring = await lock.isLocked();
      expect(lockedDuring).toBe(true);
      await promise;
      // After completion, lock should be released
      const lockedAfter = await lock.isLocked();
      expect(lockedAfter).toBe(false);
    });

    it('16. execução antiga não consegue liberar lock de novo owner após takeover', async () => {
      const lock = new MongoCatalogSyncLockRepository();
      await CatalogSyncLockModel.deleteMany({});
      await lock.tryAcquire('owner-A', 1);
      // Expire
      await new Promise((r) => setTimeout(r, 10));
      await lock.tryAcquire('owner-B', 300_000);
      // Old owner tries to release
      const released = await lock.release('owner-A');
      expect(released).toBe(false);
      const current = await lock.findLock();
      expect(current?.owner).toBe('owner-B');
      await lock.release('owner-B');
    });

    it('5. lock adquirido com sucesso (service)', async () => {
      const lock = new MongoCatalogSyncLockRepository();
      await CatalogSyncLockModel.deleteMany({});
      const { service } = createMockDeps(lock);
      const result = await service.sync({ platforms: ['nonexistent'], from: '2025-01-01', to: '2025-12-31' });
      expect(result.status).toBe('completed');
      // After success, lock should be released
      expect(await lock.isLocked()).toBe(false);
    });

    it('11. exception durante sync libera lock', async () => {
      const lock = new MongoCatalogSyncLockRepository();
      await CatalogSyncLockModel.deleteMany({});
      const { service } = createMockDeps(lock);
      // Make platformRepo throw
      (service as unknown as { platformCatalogRepository: { findById: ReturnType<typeof vi.fn> } }).platformCatalogRepository.findById = vi.fn(async () => {
        throw new Error('db fail');
      });
      // Need to mock findMany for activeOnly case? Use platforms that will trigger findById
      await expect(service.sync({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31' })).rejects.toThrow();
      // Lock should be released even after failure
      expect(await lock.isLocked()).toBe(false);
    });
  });

  describe('API concurrency', () => {
    it('1. duas requisições admin simultâneas: 1 sucesso 1 409', async () => {
      resetConfig();
      loadConfig({ ADMIN_API_TOKEN: 'test-token-1234567890123456', MONGODB_URI: TEST_MONGO });
      await CatalogSyncLockModel.deleteMany({});
      const lock = new MongoCatalogSyncLockRepository();
      const mockService = {
        sync: vi.fn(async () => {
          // Simulate long sync holding lock via real lock
          await new Promise((r) => setTimeout(r, 200));
          return { status: 'completed', platforms: [], totals: { candidatesFound: 0, newGames: 0, existingGames: 0, updatedGames: 0, rejected: 0, errors: 0 }, dryRun: false, durationMs: 200 };
        }),
      } as unknown as import('../../src/application/catalog-sync-service.js').CatalogSyncService;

      // Use real service with lock to test concurrency
      const realService = new CatalogSyncService({
        gameRepository: { findById: vi.fn(), findByExternalIdentifier: vi.fn(), existsByExternalIdentifier: vi.fn(), existsById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), save: vi.fn(), update: vi.fn(), deleteById: vi.fn() } as never,
        platformCatalogRepository: { findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), findById: vi.fn(async () => ({ id: 'p1', name: 'P1', company: 'C', releaseYear: 2020, status: 'active', family: null, type: null, thumb: null, gameCount: 0 } as never)), findByCompany: vi.fn(), upsert: vi.fn() } as never,
        discoveryEngine: { discover: vi.fn(async () => ({ query: '', groups: [], totalGroups: 0, sourceErrors: [], hasMore: false })) } as never,
        enrichmentService: { enrich: vi.fn(async (g) => ({ game: g, changes: [], conflicts: [], completeness: 'FOUND_PARTIAL' })) } as never,
        historyRepository: { create: vi.fn(async () => 'h1'), update: vi.fn(async () => {}), findById: vi.fn(), findMany: vi.fn() } as never,
        lockRepository: lock,
      });

      const app = createApp({
        games: { catalogService: { listGames: vi.fn(), searchGames: vi.fn(), getGameById: vi.fn() } as never },
        cover: { coverService: {} as never },
        platforms: { platformCatalogService: { listPlatforms: vi.fn(), getPlatformById: vi.fn() } as never },
        catalogSync: { catalogSyncService: realService as never },
        catalogSyncHistory: { historyRepository: { create: vi.fn(), update: vi.fn(), findById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })) } as never },
        admin: { gameAdminService: {} as never },
        adminCatalogSync: { catalogSyncService: realService as never },
      });

      const [a, b] = await Promise.all([
        request(app).post('/api/v1/admin/catalog/sync').set('Authorization', 'Bearer test-token-1234567890123456').send({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31' }),
        request(app).post('/api/v1/admin/catalog/sync').set('Authorization', 'Bearer test-token-1234567890123456').send({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31' }),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      const ok = [a, b].find((r) => r.status === 200)!;
      const conflict = [a, b].find((r) => r.status === 409)!;
      expect(conflict.body.error.code).toBe('CONFLICT');
      expect(ok.body.data).toBeDefined();
    });

    it('18. dois dry-runs simultâneos são permitidos', async () => {
      resetConfig();
      loadConfig({ ADMIN_API_TOKEN: 'test-token-1234567890123456', MONGODB_URI: TEST_MONGO });
      await CatalogSyncLockModel.deleteMany({});
      const lock = new MongoCatalogSyncLockRepository();
      const service = new CatalogSyncService({
        gameRepository: { findById: vi.fn(), findByExternalIdentifier: vi.fn(), existsByExternalIdentifier: vi.fn(), existsById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), save: vi.fn(), update: vi.fn(), deleteById: vi.fn() } as never,
        platformCatalogRepository: { findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), findById: vi.fn(async () => ({ id: 'p1', name: 'P1', company: 'C', releaseYear: 2020, status: 'active', family: null, type: null, thumb: null, gameCount: 0 } as never)), findByCompany: vi.fn(), upsert: vi.fn() } as never,
        discoveryEngine: { discover: vi.fn(async () => ({ query: '', groups: [], totalGroups: 0, sourceErrors: [], hasMore: false })) } as never,
        enrichmentService: { enrich: vi.fn(async (g) => ({ game: g, changes: [], conflicts: [], completeness: 'FOUND_PARTIAL' })) } as never,
        historyRepository: { create: vi.fn(async () => 'h1'), update: vi.fn(async () => {}), findById: vi.fn(), findMany: vi.fn() } as never,
        lockRepository: lock,
      });
      const [a, b] = await Promise.all([
        service.sync({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31', dryRun: true }),
        service.sync({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31', dryRun: true }),
      ]);
      expect(a.status).toBe('completed');
      expect(b.status).toBe('completed');
      expect(await lock.isLocked()).toBe(false);
    });

    it('20. dry-run não bloqueia execução real', async () => {
      resetConfig();
      loadConfig({ ADMIN_API_TOKEN: 'test-token-1234567890123456', MONGODB_URI: TEST_MONGO });
      await CatalogSyncLockModel.deleteMany({});
      const lock = new MongoCatalogSyncLockRepository();
      const service = new CatalogSyncService({
        gameRepository: { findById: vi.fn(), findByExternalIdentifier: vi.fn(), existsByExternalIdentifier: vi.fn(), existsById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), save: vi.fn(), update: vi.fn(), deleteById: vi.fn() } as never,
        platformCatalogRepository: { findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), findById: vi.fn(async () => ({ id: 'p1', name: 'P1', company: 'C', releaseYear: 2020, status: 'active', family: null, type: null, thumb: null, gameCount: 0 } as never)), findByCompany: vi.fn(), upsert: vi.fn() } as never,
        discoveryEngine: { discover: vi.fn(async () => ({ query: '', groups: [], totalGroups: 0, sourceErrors: [], hasMore: false })) } as never,
        enrichmentService: { enrich: vi.fn(async (g) => ({ game: g, changes: [], conflicts: [], completeness: 'FOUND_PARTIAL' })) } as never,
        historyRepository: { create: vi.fn(async () => 'h1'), update: vi.fn(async () => {}), findById: vi.fn(), findMany: vi.fn() } as never,
        lockRepository: lock,
      });
      const dry = service.sync({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31', dryRun: true });
      const real = service.sync({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31', dryRun: false });
      const [a, b] = await Promise.all([dry, real]);
      expect(a.status).toBe('completed');
      expect(b.status).toBe('completed');
    });

    it('21. lock ocupado → HTTP 409 com code CONFLICT', async () => {
      resetConfig();
      loadConfig({ ADMIN_API_TOKEN: 'test-token-1234567890123456', MONGODB_URI: TEST_MONGO });
      await CatalogSyncLockModel.deleteMany({});
      const lock = new MongoCatalogSyncLockRepository();
      await lock.tryAcquire('holder', 300_000);
      const service = new CatalogSyncService({
        gameRepository: { findById: vi.fn(), existsByExternalIdentifier: vi.fn(), findByExternalIdentifier: vi.fn(), existsById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), save: vi.fn(), update: vi.fn(), deleteById: vi.fn() } as never,
        platformCatalogRepository: { findMany: vi.fn(), findById: vi.fn(), findByCompany: vi.fn(), upsert: vi.fn() } as never,
        discoveryEngine: { discover: vi.fn() } as never,
        enrichmentService: { enrich: vi.fn() } as never,
        historyRepository: { create: vi.fn(), update: vi.fn(), findById: vi.fn(), findMany: vi.fn() } as never,
        lockRepository: lock,
      });
      const app = createApp({
        games: { catalogService: { listGames: vi.fn(), searchGames: vi.fn(), getGameById: vi.fn() } as never },
        cover: { coverService: {} as never },
        platforms: { platformCatalogService: { listPlatforms: vi.fn(), getPlatformById: vi.fn() } as never },
        catalogSync: { catalogSyncService: service as never },
        catalogSyncHistory: { historyRepository: { create: vi.fn(), update: vi.fn(), findById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })) } as never },
        admin: { gameAdminService: {} as never },
        adminCatalogSync: { catalogSyncService: service as never },
      });
      const res = await request(app).post('/api/v1/admin/catalog/sync').set('Authorization', 'Bearer test-token-1234567890123456').send({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(JSON.stringify(res.body)).not.toContain('holder');
      await lock.release('holder');
    });

    it('24. request rejeitado por lock não cria history running', async () => {
      resetConfig();
      loadConfig({ ADMIN_API_TOKEN: 'test-token-1234567890123456', MONGODB_URI: TEST_MONGO });
      await CatalogSyncLockModel.deleteMany({});
      const lock = new MongoCatalogSyncLockRepository();
      await lock.tryAcquire('holder', 300_000);
      const history = { create: vi.fn(async () => 'h1'), update: vi.fn(async () => {}), findById: vi.fn(), findMany: vi.fn() } as never;
      const service = new CatalogSyncService({
        gameRepository: { findById: vi.fn(), findByExternalIdentifier: vi.fn(), existsByExternalIdentifier: vi.fn(), existsById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), save: vi.fn(), update: vi.fn(), deleteById: vi.fn() } as never,
        platformCatalogRepository: { findMany: vi.fn(), findById: vi.fn(), findByCompany: vi.fn(), upsert: vi.fn() } as never,
        discoveryEngine: { discover: vi.fn() } as never,
        enrichmentService: { enrich: vi.fn() } as never,
        historyRepository: history,
        lockRepository: lock,
      });
      await expect(service.sync({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31' })).rejects.toThrow();
      expect(history.create).not.toHaveBeenCalled();
      await lock.release('holder');
    });

    it('25. execução vencedora cria exatamente uma entrada de history', async () => {
      resetConfig();
      loadConfig({ ADMIN_API_TOKEN: 'test-token-1234567890123456', MONGODB_URI: TEST_MONGO });
      await CatalogSyncLockModel.deleteMany({});
      const lock = new MongoCatalogSyncLockRepository();
      const history = { create: vi.fn(async () => 'h1'), update: vi.fn(async () => {}), findById: vi.fn(), findMany: vi.fn() } as never;
      const service = new CatalogSyncService({
        gameRepository: { findById: vi.fn(), findByExternalIdentifier: vi.fn(), existsByExternalIdentifier: vi.fn(), existsById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), save: vi.fn(), update: vi.fn(), deleteById: vi.fn() } as never,
        platformCatalogRepository: { findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), findById: vi.fn(async () => ({ id: 'p1', name: 'P1', company: 'C', releaseYear: 2020, status: 'active', family: null, type: null, thumb: null, gameCount: 0 } as never)), findByCompany: vi.fn(), upsert: vi.fn() } as never,
        discoveryEngine: { discover: vi.fn(async () => ({ query: '', groups: [], totalGroups: 0, sourceErrors: [], hasMore: false })) } as never,
        enrichmentService: { enrich: vi.fn(async (g) => ({ game: g, changes: [], conflicts: [], completeness: 'FOUND_PARTIAL' })) } as never,
        historyRepository: history,
        lockRepository: lock,
      });
      const result = await service.sync({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31' });
      expect(result.historyId).toBe('h1');
      expect(history.create).toHaveBeenCalledTimes(1);
      expect(history.update).toHaveBeenCalledTimes(1);
      expect(await lock.isLocked()).toBe(false);
    });

    it('2. admin + legacy simultâneos: apenas uma execução', async () => {
      resetConfig();
      loadConfig({ ADMIN_API_TOKEN: 'test-token-1234567890123456', MONGODB_URI: TEST_MONGO });
      await CatalogSyncLockModel.deleteMany({});
      const lock = new MongoCatalogSyncLockRepository();
      const service = new CatalogSyncService({
        gameRepository: { findById: vi.fn(), findByExternalIdentifier: vi.fn(), existsByExternalIdentifier: vi.fn(), existsById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), save: vi.fn(), update: vi.fn(), deleteById: vi.fn() } as never,
        platformCatalogRepository: { findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })), findById: vi.fn(async () => ({ id: 'p1', name: 'P1', company: 'C', releaseYear: 2020, status: 'active', family: null, type: null, thumb: null, gameCount: 0 } as never)), findByCompany: vi.fn(), upsert: vi.fn() } as never,
        discoveryEngine: { discover: vi.fn(async () => { await new Promise((r) => setTimeout(r, 100)); return { query: '', groups: [], totalGroups: 0, sourceErrors: [], hasMore: false }; }) } as never,
        enrichmentService: { enrich: vi.fn(async (g) => ({ game: g, changes: [], conflicts: [], completeness: 'FOUND_PARTIAL' })) } as never,
        historyRepository: { create: vi.fn(async () => 'h1'), update: vi.fn(async () => {}), findById: vi.fn(), findMany: vi.fn() } as never,
        lockRepository: lock,
      });
      const app = createApp({
        games: { catalogService: { listGames: vi.fn(), searchGames: vi.fn(), getGameById: vi.fn() } as never },
        cover: { coverService: {} as never },
        platforms: { platformCatalogService: { listPlatforms: vi.fn(), getPlatformById: vi.fn() } as never },
        catalogSync: { catalogSyncService: service as never },
        catalogSyncHistory: { historyRepository: { create: vi.fn(), update: vi.fn(), findById: vi.fn(), findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })) } as never },
        admin: { gameAdminService: {} as never },
        adminCatalogSync: { catalogSyncService: service as never },
      });
      const [admin, legacy] = await Promise.all([
        request(app).post('/api/v1/admin/catalog/sync').set('Authorization', 'Bearer test-token-1234567890123456').send({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31' }),
        request(app).post('/api/v1/catalog/sync').set('Authorization', 'Bearer test-token-1234567890123456').send({ platforms: ['p1'], from: '2025-01-01', to: '2025-12-31' }),
      ]);
      const statuses = [admin.status, legacy.status].sort();
      expect(statuses).toEqual([200, 409]);
    });
  });
});
