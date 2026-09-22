import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoPlatformRepository } from '../../src/infrastructure/persistence/mongodb/mongo-platform-repository.js';
import { ATPPlatformModel } from '../../src/infrastructure/persistence/mongodb/platform-schema.js';
import {
  createATPPlatform,
  addPlatformExternalIdentity,
} from '../../src/domain/platform/atp-platform.js';
import { createPlatformExternalIdentity } from '../../src/domain/platform/platform-external-identity.js';

// Isolated scratch database. Never the development catalog.
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/atp-engine-test';

describe('MongoPlatformRepository', () => {
  let repository: MongoPlatformRepository;

  beforeAll(async () => {
    await mongoose.connect(MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await ATPPlatformModel.ensureIndexes();
    repository = new MongoPlatformRepository();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await ATPPlatformModel.deleteMany({});
  });

  it('saves and retrieves a platform without identities', async () => {
    const platform = createATPPlatform({ name: 'Nintendo Switch' });
    await repository.save(platform);

    const byId = await repository.findById(platform.id);
    expect(byId?.slug).toBe('nintendo-switch');
    const bySlug = await repository.findBySlug('nintendo-switch');
    expect(bySlug?.id).toBe(platform.id);
  });

  it('round-trips external identities', async () => {
    const platform = addPlatformExternalIdentity(
      createATPPlatform({ name: 'PlayStation 4' }),
      createPlatformExternalIdentity('igdb', 48),
    );
    await repository.save(platform);

    const found = await repository.findByExternalIdentity('igdb', 48);
    expect(found?.id).toBe(platform.id);
    expect(await repository.findByExternalIdentity('mobygames', 48)).toBeNull();
    expect(await repository.findByExternalIdentity('igdb', 49)).toBeNull();
  });

  it('save is idempotent by platform id', async () => {
    const platform = createATPPlatform({ name: 'PlayStation 4' });
    await repository.save(platform);
    await repository.save(platform);
    expect(await ATPPlatformModel.countDocuments({})).toBe(1);
  });
});
