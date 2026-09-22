import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/interfaces/http/app.js';
import { loadConfig, resetConfig } from '../../src/infrastructure/config/config.js';
import { hashAdminPassword } from '../../src/infrastructure/auth/admin-password.js';
import { clearAllSessions } from '../../src/infrastructure/auth/admin-session.js';
import { clearLoginRateLimit } from '../../src/interfaces/http/routes/admin-auth-routes.js';

const ADMIN_TOKEN = 'test-admin-token-1234567890123456';

function buildApp() {
  return createApp({
    games: { catalogService: { listGames: vi.fn(), searchGames: vi.fn(), getGameById: vi.fn() } as never },
    cover: { coverService: {} as never },
    platforms: { platformCatalogService: { listPlatforms: vi.fn(), getPlatformById: vi.fn() } as never },
    catalogSync: { catalogSyncService: { sync: vi.fn() } as never },
    catalogSyncHistory: { historyRepository: { create: vi.fn(), update: vi.fn(), findById: vi.fn(), findMany: vi.fn() } as never },
    admin: { gameAdminService: {} as never },
  });
}

describe('GET /api/v1/admin/database/stats', () => {
  beforeEach(() => {
    resetConfig();
    clearAllSessions();
    clearLoginRateLimit();
    vi.restoreAllMocks();
  });

  it('401 sem autenticação', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    const res = await request(app).get('/api/v1/admin/database/stats');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('200 com sessão admin', async () => {
    const hash = await hashAdminPassword('secret123');
    loadConfig({ ADMIN_USERNAME: 'admin', ADMIN_PASSWORD_HASH: hash, ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    // mock mongoose db
    const mockDb = {
      command: vi.fn(async (cmd: Record<string, unknown>) => {
        if ('dbStats' in cmd) return { dataSize: 12345, storageSize: 15000, indexSize: 2000, objects: 100, collections: 2, avgObjSize: 123 };
        if ('collStats' in cmd) return { count: 50, size: 6000, storageSize: 7000, totalIndexSize: 1000 };
        throw new Error('unknown');
      }),
      listCollections: vi.fn(() => ({ toArray: async () => [{ name: 'games' }, { name: 'platformcatalogs' }] })),
    };
    // @ts-ignore mock
    mongoose.connection.db = mockDb as unknown as typeof mongoose.connection.db;
    const login = await request(app).post('/api/v1/admin/login').send({ username: 'admin', password: 'secret123' });
    const cookie = login.headers['set-cookie'][0] as string;
    const res = await request(app).get('/api/v1/admin/database/stats').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.dataSize).toBe(12345);
    expect(res.body.data.storageSize).toBe(15000);
    expect(res.body.data.indexSize).toBe(2000);
    expect(res.body.data.objects).toBe(100);
    expect(res.body.data.collections).toBe(2);
    expect(res.body.data.collectionsStats).toBeDefined();
    expect(res.body.data.collectionsStats).toHaveLength(2);
    // no sensitive info
    expect(JSON.stringify(res.body)).not.toContain('ADMIN_API_TOKEN');
  });

  it('200 com Bearer', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    const mockDb = {
      command: vi.fn(async (cmd: Record<string, unknown>) => {
        if ('dbStats' in cmd) return { dataSize: 0, storageSize: 0, indexSize: 0, objects: 0, collections: 0, avgObjSize: 0 };
        if ('collStats' in cmd) return { count: 0, size: 0, storageSize: 0, totalIndexSize: 0 };
        throw new Error('unknown');
      }),
      listCollections: vi.fn(() => ({ toArray: async () => [] })),
    };
    // @ts-ignore
    mongoose.connection.db = mockDb as unknown as typeof mongoose.connection.db;
    const res = await request(app).get('/api/v1/admin/database/stats').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.data.dataSize).toBe(0);
  });

  it('resposta estruturada', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    const mockDb = {
      command: vi.fn(async (cmd: Record<string, unknown>) => {
        if ('dbStats' in cmd) return { dataSize: 100, storageSize: 200, indexSize: 50, objects: 10, collections: 1, avgObjSize: 10 };
        if ('collStats' in cmd) return { count: 10, size: 100, storageSize: 200, totalIndexSize: 50 };
        throw new Error('unknown');
      }),
      listCollections: vi.fn(() => ({ toArray: async () => [{ name: 'games' }] })),
    };
    // @ts-ignore
    mongoose.connection.db = mockDb as unknown as typeof mongoose.connection.db;
    const res = await request(app).get('/api/v1/admin/database/stats').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.body.data).toHaveProperty('dataSize');
    expect(res.body.data).toHaveProperty('storageSize');
    expect(res.body.data).toHaveProperty('indexSize');
    expect(res.body.data).toHaveProperty('totalSize');
    expect(res.body.data).toHaveProperty('objects');
    expect(res.body.data).toHaveProperty('collections');
    expect(res.body.data).toHaveProperty('avgObjSize');
    expect(res.body.data).toHaveProperty('collectionsStats');
    expect(Array.isArray(res.body.data.collectionsStats)).toBe(true);
    expect(res.body.data.collectionsStats[0]).toHaveProperty('name');
    expect(res.body.data.collectionsStats[0]).toHaveProperty('count');
    expect(res.body.data.collectionsStats[0]).toHaveProperty('size');
  });

  it('erro interno → 500 com requestId e sem stack', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    // @ts-ignore
    mongoose.connection.db = null;
    const res = await request(app).get('/api/v1/admin/database/stats').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('DATABASE_STATS_ERROR');
    expect(res.body.error.requestId).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('stack');
  });

  it('nenhuma informação sensível no erro', async () => {
    loadConfig({ ADMIN_API_TOKEN: ADMIN_TOKEN });
    const app = buildApp();
    const mockDb = {
      command: vi.fn(async () => { throw new Error('mongo secret'); }),
      listCollections: vi.fn(() => ({ toArray: async () => [] })),
    };
    // @ts-ignore
    mongoose.connection.db = mockDb as unknown as typeof mongoose.connection.db;
    const res = await request(app).get('/api/v1/admin/database/stats').set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('mongo secret');
    expect(JSON.stringify(res.body)).not.toContain('ADMIN_API_TOKEN');
  });
});
