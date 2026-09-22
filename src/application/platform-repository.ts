import type { ATPPlatform } from '../domain/platform/atp-platform.js';

/**
 * Canonical ATP platform store.
 *
 * Identity invariants (enforced here, backed by unique indexes):
 * - one row per ATP platform id;
 * - one row per slug;
 * - one row per external identity pair `source + sourcePlatformId`
 *   (an external identity belongs to at most one platform).
 */
export interface PlatformRepository {
  /** Insert or replace by platform id (idempotent). */
  save(platform: ATPPlatform): Promise<void>;

  findById(id: string): Promise<ATPPlatform | null>;

  findBySlug(slug: string): Promise<ATPPlatform | null>;

  /** Exact provider-identity lookup. No fuzzy matching, ever. */
  findByExternalIdentity(source: string, sourcePlatformId: number): Promise<ATPPlatform | null>;
}
