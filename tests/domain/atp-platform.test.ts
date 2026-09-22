import { describe, it, expect } from 'vitest';
import {
  createATPPlatform,
  slugifyPlatformName,
  addPlatformExternalIdentity,
  findPlatformExternalIdentity,
  atpPlatformEquals,
} from '../../src/domain/platform/atp-platform.js';
import {
  createPlatformExternalIdentity,
  platformExternalIdentityEquals,
  platformExternalIdentityKey,
} from '../../src/domain/platform/platform-external-identity.js';

describe('ATPPlatform', () => {
  it('creates a valid platform with deterministic id and slug', () => {
    const platform = createATPPlatform({ name: 'PlayStation 4' });
    expect(platform.id).toBe('atp-platform-playstation-4');
    expect(platform.slug).toBe('playstation-4');
    expect(platform.name).toBe('PlayStation 4');
    expect(platform.externalIdentities).toEqual([]);
  });

  it('derives the same id and slug for the same name', () => {
    const a = createATPPlatform({ name: 'PlayStation 4' });
    const b = createATPPlatform({ name: '  PlayStation   4 ' });
    expect(a.id).toBe(b.id);
    expect(a.slug).toBe(b.slug);
  });

  it('slugifies deterministically', () => {
    expect(slugifyPlatformName('Nintendo Switch')).toBe('nintendo-switch');
    expect(slugifyPlatformName('SAM Coupé')).toBe('sam-coupe');
    expect(slugifyPlatformName('1292 Advanced Programmable Video System')).toBe(
      '1292-advanced-programmable-video-system',
    );
  });

  it('rejects empty names and names with no slug content', () => {
    expect(() => createATPPlatform({ name: '' })).toThrow();
    expect(() => createATPPlatform({ name: '   ' })).toThrow();
    expect(() => createATPPlatform({ name: '---' })).toThrow();
  });

  it('compares platforms by id', () => {
    const a = createATPPlatform({ name: 'PlayStation 4' });
    const b = createATPPlatform({ name: 'PlayStation 4' });
    const c = createATPPlatform({ name: 'PlayStation 5' });
    expect(atpPlatformEquals(a, b)).toBe(true);
    expect(atpPlatformEquals(a, c)).toBe(false);
  });

  it('carries no source metadata', () => {
    const platform = createATPPlatform({ name: 'PlayStation 4' });
    expect('expectedGames' in platform).toBe(false);
  });
});

describe('PlatformExternalIdentity', () => {
  it('represents igdb:48', () => {
    const identity = createPlatformExternalIdentity('igdb', 48);
    expect(platformExternalIdentityKey(identity)).toBe('igdb:48');
  });

  it('treats igdb:48 and mobygames:48 as different identities', () => {
    const igdb = createPlatformExternalIdentity('igdb', 48);
    const moby = createPlatformExternalIdentity('mobygames', 48);
    expect(platformExternalIdentityEquals(igdb, moby)).toBe(false);
  });

  it('rejects empty sources and non-positive ids', () => {
    expect(() => createPlatformExternalIdentity('', 48)).toThrow();
    expect(() => createPlatformExternalIdentity('igdb', 0)).toThrow();
    expect(() => createPlatformExternalIdentity('igdb', -1)).toThrow();
    expect(() => createPlatformExternalIdentity('igdb', 4.5)).toThrow();
  });
});

describe('platform ↔ external identity relationship', () => {
  it('holds zero, one or several external identities', () => {
    let platform = createATPPlatform({ name: 'PlayStation 4' });
    expect(platform.externalIdentities).toHaveLength(0);
    platform = addPlatformExternalIdentity(platform, createPlatformExternalIdentity('igdb', 48));
    platform = addPlatformExternalIdentity(
      platform,
      createPlatformExternalIdentity('mobygames', 9999),
    );
    expect(platform.externalIdentities).toHaveLength(2);
    expect(findPlatformExternalIdentity(platform, 'igdb', 48)).toBeDefined();
    expect(findPlatformExternalIdentity(platform, 'igdb', 49)).toBeUndefined();
  });

  it('rejects the identical identity twice', () => {
    const platform = createATPPlatform({
      name: 'PlayStation 4',
      externalIdentities: [createPlatformExternalIdentity('igdb', 48)],
    });
    expect(() =>
      addPlatformExternalIdentity(platform, createPlatformExternalIdentity('igdb', 48)),
    ).toThrow();
    expect(() =>
      createATPPlatform({
        name: 'PlayStation 4',
        externalIdentities: [
          createPlatformExternalIdentity('igdb', 48),
          createPlatformExternalIdentity('igdb', 48),
        ],
      }),
    ).toThrow();
  });

  it('does not map by name: same name in two sources links nothing', () => {
    // Creating a platform from a manifest-style name attaches zero
    // identities. A future mapping step must provide deterministic
    // evidence; nothing here infers igdb:48 from "PlayStation 4".
    const fromMobyName = createATPPlatform({ name: 'PlayStation 4' });
    const fromIgdbName = createATPPlatform({ name: 'PlayStation 4' });
    expect(fromMobyName.externalIdentities).toEqual([]);
    expect(fromIgdbName.externalIdentities).toEqual([]);
    expect(findPlatformExternalIdentity(fromMobyName, 'igdb', 48)).toBeUndefined();
  });
});
