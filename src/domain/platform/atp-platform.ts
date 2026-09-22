import type { PlatformId } from '../shared/ids.js';
import { createPlatformId } from '../shared/ids.js';
import type { PlatformExternalIdentity } from './platform-external-identity.js';
import { platformExternalIdentityEquals } from './platform-external-identity.js';

/**
 * Canonical ATP platform identity.
 *
 * - `id` is ATP-internal (never `igdb:48` or any provider value).
 * - `slug` is deterministic from the canonical name.
 * - `name` is the canonical display name (metadata, not identity).
 * - `externalIdentities` links zero or more provider identities; each
 *   pair `source + sourcePlatformId` may belong to at most one platform
 *   (enforced by the repository). Links are only ever added from a
 *   deterministic source — never inferred from names.
 *
 * Source-specific data such as `expectedGames` deliberately lives on
 * the manifest/reference side, never here.
 */

export interface ATPPlatform {
  readonly id: PlatformId;
  readonly slug: string;
  readonly name: string;
  readonly externalIdentities: readonly PlatformExternalIdentity[];
}

/** Deterministic slug: lowercase, diacritics stripped, runs of other
 * characters collapsed to a single `-`, never leading/trailing `-`. */
export function slugifyPlatformName(name: string): string {
  const ascii = name.normalize('NFD').replace(/\p{M}/gu, '');
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createATPPlatform(input: {
  name: string;
  externalIdentities?: readonly PlatformExternalIdentity[];
}): ATPPlatform {
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('ATPPlatform name must not be empty');
  }
  const name = input.name.trim();
  const slug = slugifyPlatformName(name);
  if (slug.length === 0) {
    throw new Error('ATPPlatform name produces an empty slug');
  }
  const identities = input.externalIdentities ?? [];
  for (let i = 0; i < identities.length; i += 1) {
    for (let j = i + 1; j < identities.length; j += 1) {
      if (platformExternalIdentityEquals(identities[i], identities[j])) {
        throw new Error(
          `ATPPlatform has a duplicate external identity: ${identities[i].source}:${identities[i].sourcePlatformId}`,
        );
      }
    }
  }
  return {
    id: createPlatformId(`atp-platform-${slug}`),
    slug,
    name,
    externalIdentities: [...identities],
  };
}

/**
 * Attach a provider identity. Throws when the identical pair already
 * exists. Returns a new platform value; inputs are never mutated.
 */
export function addPlatformExternalIdentity(
  platform: ATPPlatform,
  identity: PlatformExternalIdentity,
): ATPPlatform {
  if (platform.externalIdentities.some((existing) => platformExternalIdentityEquals(existing, identity))) {
    throw new Error(
      `ATPPlatform ${platform.id} already has external identity ${identity.source}:${identity.sourcePlatformId}`,
    );
  }
  return { ...platform, externalIdentities: [...platform.externalIdentities, identity] };
}

export function findPlatformExternalIdentity(
  platform: ATPPlatform,
  source: string,
  sourcePlatformId: number,
): PlatformExternalIdentity | undefined {
  return platform.externalIdentities.find(
    (identity) => identity.source === source && identity.sourcePlatformId === sourcePlatformId,
  );
}

export function atpPlatformEquals(a: ATPPlatform, b: ATPPlatform): boolean {
  return a.id === b.id;
}
