import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoPlatformCatalogRepository } from '../../src/infrastructure/persistence/mongodb/mongo-platform-catalog-repository.js';
import { PlatformCatalogModel } from '../../src/infrastructure/persistence/mongodb/platform-catalog-schema.js';

// Isolated scratch database. Never the development catalog.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/atp-engine-test';

async function seed(names: string[]): Promise<void> {
  await PlatformCatalogModel.insertMany(
    names.map((name, index) => ({
      platformId: `test-${index}`,
      name,
      company: 'Test Company',
      releaseYear: 2000,
      status: 'active',
      family: null,
      type: 'console',
      thumb: null,
    })),
  );
}

describe('MongoPlatformCatalogRepository sorting', () => {
  let repository: MongoPlatformCatalogRepository;

  beforeAll(async () => {
    await mongoose.connect(MONGODB_URI);
    await mongoose.connection.dropDatabase();
    repository = new MongoPlatformCatalogRepository();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await PlatformCatalogModel.deleteMany({});
  });

  it('sorts by name ascending', async () => {
    await seed(['Zebra', 'Apple', 'Mango']);

    const result = await repository.findMany({ sort: { field: 'name', direction: 'asc' } });

    expect(result.items.map((p) => p.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('sorts by name descending (direction must not be dropped)', async () => {
    await seed(['Zebra', 'Apple', 'Mango']);

    const result = await repository.findMany({ sort: { field: 'name', direction: 'desc' } });

    expect(result.items.map((p) => p.name)).toEqual(['Zebra', 'Mango', 'Apple']);
  });

  it('sorts by releaseYear descending', async () => {
    await PlatformCatalogModel.insertMany([
      {
        platformId: 'old',
        name: 'Old',
        company: 'Test Company',
        releaseYear: 1990,
        status: 'active',
        family: null,
        type: 'console',
        thumb: null,
      },
      {
        platformId: 'new',
        name: 'New',
        company: 'Test Company',
        releaseYear: 2020,
        status: 'active',
        family: null,
        type: 'console',
        thumb: null,
      },
    ]);

    const result = await repository.findMany({
      sort: { field: 'releaseYear', direction: 'desc' },
    });

    expect(result.items.map((p) => p.name)).toEqual(['New', 'Old']);
  });
});
