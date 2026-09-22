import type { PlatformRepository } from '../../../application/platform-repository.js';
import type { ATPPlatform } from '../../../domain/platform/atp-platform.js';
import { createPlatformId } from '../../../domain/shared/ids.js';
import { ATPPlatformModel } from './platform-schema.js';
import { PersistenceError } from '../../../shared/errors/errors.js';

function toDomain(doc: {
  platformId: string;
  slug: string;
  name: string;
  externalIdentities: { source: string; sourcePlatformId: number }[];
}): ATPPlatform {
  return {
    id: createPlatformId(doc.platformId),
    slug: doc.slug,
    name: doc.name,
    externalIdentities: doc.externalIdentities.map((e) => ({
      source: e.source,
      sourcePlatformId: e.sourcePlatformId,
    })),
  };
}

export class MongoPlatformRepository implements PlatformRepository {
  async save(platform: ATPPlatform): Promise<void> {
    try {
      await ATPPlatformModel.updateOne(
        { platformId: platform.id },
        {
          $set: {
            slug: platform.slug,
            name: platform.name,
            externalIdentities: platform.externalIdentities.map((e) => ({
              source: e.source,
              sourcePlatformId: e.sourcePlatformId,
            })),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      throw new PersistenceError('Failed to save ATP platform', { cause: error });
    }
  }

  async findById(id: string): Promise<ATPPlatform | null> {
    try {
      const doc = await ATPPlatformModel.findOne({ platformId: id }).lean();
      return doc ? toDomain(doc) : null;
    } catch (error) {
      throw new PersistenceError('Failed to find ATP platform', { cause: error });
    }
  }

  async findBySlug(slug: string): Promise<ATPPlatform | null> {
    try {
      const doc = await ATPPlatformModel.findOne({ slug }).lean();
      return doc ? toDomain(doc) : null;
    } catch (error) {
      throw new PersistenceError('Failed to find ATP platform', { cause: error });
    }
  }

  async findByExternalIdentity(
    source: string,
    sourcePlatformId: number,
  ): Promise<ATPPlatform | null> {
    try {
      const doc = await ATPPlatformModel.findOne({
        externalIdentities: { $elemMatch: { source, sourcePlatformId } },
      }).lean();
      return doc ? toDomain(doc) : null;
    } catch (error) {
      throw new PersistenceError('Failed to find ATP platform', { cause: error });
    }
  }
}
