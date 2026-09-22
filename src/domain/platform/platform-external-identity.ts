/**
 * A platform's identity inside one provider (e.g. IGDB id 48).
 *
 * The pair `source + sourcePlatformId` is globally unique: `igdb:48`
 * and `mobygames:48` are different identities. Values are never
 * derived from names — no fuzzy matching, no similarity, no LLM, no
 * heuristics. An identity exists only when a deterministic source
 * provides it.
 */

export interface PlatformExternalIdentity {
  readonly source: string;
  readonly sourcePlatformId: number;
}

export function createPlatformExternalIdentity(
  source: string,
  sourcePlatformId: number,
): PlatformExternalIdentity {
  if (!source || source.trim().length === 0) {
    throw new Error('PlatformExternalIdentity source must not be empty');
  }
  if (!Number.isInteger(sourcePlatformId) || sourcePlatformId <= 0) {
    throw new Error('PlatformExternalIdentity sourcePlatformId must be an integer > 0');
  }
  return { source: source.trim(), sourcePlatformId };
}

export function platformExternalIdentityEquals(
  a: PlatformExternalIdentity,
  b: PlatformExternalIdentity,
): boolean {
  return a.source === b.source && a.sourcePlatformId === b.sourcePlatformId;
}

/** Canonical display form, e.g. `igdb:48`. Identity, never inference. */
export function platformExternalIdentityKey(identity: PlatformExternalIdentity): string {
  return `${identity.source}:${identity.sourcePlatformId}`;
}
