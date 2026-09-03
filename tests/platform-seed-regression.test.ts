import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { PlatformCatalogModel } from '../src/infrastructure/persistence/mongodb/platform-catalog-schema.js';
import { GameModel } from '../src/infrastructure/persistence/mongodb/game-schema.js';
import { MongoPlatformCatalogRepository } from '../src/infrastructure/persistence/mongodb/mongo-platform-catalog-repository.js';
import type { PlatformCatalogRepository } from '../src/domain/platform/platform-catalog-repository.js';
import { PlatformSeedService } from '../src/application/platform-seed-service.js';

import { createPlatformCatalogEntry } from '../src/domain/platform/platform-catalog.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/atp-engine-test';

describe('Platform Seed (Regression)', () => {
  let repository: MongoPlatformCatalogRepository;
  let seedService: PlatformSeedService;

  beforeAll(async () => {
    await mongoose.connect(MONGODB_URI);
    repository = new MongoPlatformCatalogRepository();
    seedService = new PlatformSeedService({ platformCatalogRepository: repository });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await PlatformCatalogModel.deleteMany({});
    await GameModel.deleteMany({});
  });

  it('seed inserts platforms into empty database', async () => {
    const result = await seedService.seed();

    expect(result.inserted).toBe(181);
    expect(result.updated).toBe(0);
    expect(result.errors).toBe(0);

    const count = await PlatformCatalogModel.countDocuments();
    expect(count).toBe(181);
  });

  it('seed is idempotent (running twice does not duplicate)', async () => {
    const result1 = await seedService.seed();
    expect(result1.inserted).toBe(181);
    expect(result1.errors).toBe(0);

    const result2 = await seedService.seed();
    expect(result2.inserted).toBe(0);
    expect(result2.updated).toBe(181);
    expect(result2.errors).toBe(0);

    const count = await PlatformCatalogModel.countDocuments();
    expect(count).toBe(181);
  });

  it('specific platforms are present after seed', async () => {
    await seedService.seed();

    const expectedPlatforms = [
      { platformId: 'nintendo-entertainment-system', name: 'Nintendo Entertainment System' },
      {
        platformId: 'super-nintendo-entertainment-system',
        name: 'Super Nintendo Entertainment System',
      },
      { platformId: 'nintendo-64', name: 'Nintendo 64' },
      { platformId: 'playstation', name: 'PlayStation' },
      { platformId: 'playstation-2', name: 'PlayStation 2' },
      { platformId: 'nintendo-switch', name: 'Nintendo Switch' },
      { platformId: 'pc-windows', name: 'PC (Windows)' },
    ];

    for (const expected of expectedPlatforms) {
      const doc = await PlatformCatalogModel.findOne({ platformId: expected.platformId }).lean();
      expect(doc).not.toBeNull();
      expect(doc!.name).toBe(expected.name);
    }
  });

  it('platforms can be retrieved by repository', async () => {
    await seedService.seed();

    const page1 = await repository.findMany({ limit: 100, page: 1 });
    const page2 = await repository.findMany({ limit: 100, page: 2 });
    expect(page1.items.length).toBe(100);
    expect(page2.items.length).toBe(81);
    expect(page1.total).toBe(181);
  });

  it('summary endpoint returns seeded platforms', async () => {
    await seedService.seed();

    const result = await repository.findMany({});
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toHaveProperty('gameCount');
  });

  it('errors are properly propagated', async () => {
    const failingRepository = {
      findMany: async () => {
        throw new Error('DB error');
      },
      findById: async () => null,
      findByCompany: async () => [],
      upsert: async () => {
        throw new Error('Upsert failed');
      },
    };

    const failingSeedService = new PlatformSeedService({
      platformCatalogRepository: failingRepository as unknown as PlatformCatalogRepository,
    });

    const result = await failingSeedService.seed();
    expect(result.errors).toBe(181);
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
  });

  it('upsert via Mongoose with runValidators succeeds', async () => {
    const entry = createPlatformCatalogEntry({
      id: 'test-upsert',
      name: 'Test Platform',
      company: 'Test Corp',
      releaseYear: 2000,
      status: 'active',
      family: 'Nintendo',
      type: 'console',
    });

    await PlatformCatalogModel.findOneAndUpdate(
      { platformId: entry.id },
      {
        $set: {
          platformId: entry.id,
          name: entry.name,
          company: entry.company,
          releaseYear: entry.releaseYear,
          status: entry.status,
          family: entry.family,
          type: entry.type,
          thumb: entry.thumb,
        },
      },
      { upsert: true, runValidators: true },
    );

    const doc = await PlatformCatalogModel.findOne({ platformId: 'test-upsert' }).lean();
    expect(doc).not.toBeNull();
    expect(doc!.name).toBe('Test Platform');
  });
});
