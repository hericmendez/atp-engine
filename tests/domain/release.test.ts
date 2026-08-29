import { describe, it, expect } from 'vitest';
import {
  createRelease,
  createReleaseId,
  createGameId,
  createPlatform,
  createRegion,
  createReleaseDate,
  createExternalIdentifier,
  createSourceEvidence,
  releaseDateEquals,
  platformEquals,
  regionEquals,
} from '../../src/domain/index.js';

describe('Release', () => {
  const gameId = createGameId('game-1');

  it('creates a valid release', () => {
    const release = createRelease({
      id: createReleaseId('rel-1'),
      gameId,
      platform: createPlatform('Nintendo Switch'),
    });

    expect(release.id).toBe('rel-1');
    expect(release.gameId).toBe(gameId);
    expect(release.platform.name).toBe('Nintendo Switch');
    expect(release.region).toBeNull();
    expect(release.releaseDate).toBeNull();
  });

  it('creates release with all fields', () => {
    const release = createRelease({
      id: createReleaseId('rel-1'),
      gameId,
      platform: createPlatform('PlayStation 2'),
      region: createRegion('NTSC-USA'),
      releaseDate: createReleaseDate(2005, 1, 11),
      version: '1.0',
      edition: 'Standard',
      externalIdentifiers: [createExternalIdentifier('steamdb', '12345')],
      evidence: [createSourceEvidence('wikipedia', 'wiki-123')],
    });

    expect(release.region?.name).toBe('NTSC-USA');
    expect(release.releaseDate?.year).toBe(2005);
    expect(release.version).toBe('1.0');
    expect(release.edition).toBe('Standard');
    expect(release.externalIdentifiers).toHaveLength(1);
    expect(release.evidence).toHaveLength(1);
  });

  it('creates release with year-only date', () => {
    const release = createRelease({
      id: createReleaseId('rel-1'),
      gameId,
      platform: createPlatform('PC'),
      releaseDate: createReleaseDate(2023),
    });

    expect(release.releaseDate?.year).toBe(2023);
    expect(release.releaseDate?.month).toBeNull();
    expect(release.releaseDate?.day).toBeNull();
    expect(release.releaseDate?.precision).toBe('year');
  });

  it('creates release with month precision', () => {
    const release = createRelease({
      id: createReleaseId('rel-1'),
      gameId,
      platform: createPlatform('PC'),
      releaseDate: createReleaseDate(2023, 3),
    });

    expect(release.releaseDate?.precision).toBe('month');
  });
});

describe('ReleaseDate', () => {
  it('creates date with day precision', () => {
    const date = createReleaseDate(2005, 1, 11);
    expect(date.precision).toBe('day');
    expect(date.year).toBe(2005);
    expect(date.month).toBe(1);
    expect(date.day).toBe(11);
  });

  it('creates date with year only', () => {
    const date = createReleaseDate(2023);
    expect(date.precision).toBe('year');
    expect(date.month).toBeNull();
    expect(date.day).toBeNull();
  });

  it('throws on invalid year', () => {
    expect(() => createReleaseDate(1949)).toThrow('Invalid release year');
    expect(() => createReleaseDate(2101)).toThrow('Invalid release year');
  });

  it('throws on invalid month', () => {
    expect(() => createReleaseDate(2023, 0)).toThrow('Invalid release month');
    expect(() => createReleaseDate(2023, 13)).toThrow('Invalid release month');
  });

  it('throws on invalid day', () => {
    expect(() => createReleaseDate(2023, 1, 0)).toThrow('Invalid release day');
    expect(() => createReleaseDate(2023, 1, 32)).toThrow('Invalid release day');
  });

  it('compares dates for equality', () => {
    const a = createReleaseDate(2005, 1, 11);
    const b = createReleaseDate(2005, 1, 11);
    const c = createReleaseDate(2005, 1, 12);

    expect(releaseDateEquals(a, b)).toBe(true);
    expect(releaseDateEquals(a, c)).toBe(false);
  });
});

describe('Platform', () => {
  it('creates platform with trimmed name', () => {
    const platform = createPlatform('  Nintendo Switch  ');
    expect(platform.name).toBe('Nintendo Switch');
  });

  it('throws on empty name', () => {
    expect(() => createPlatform('')).toThrow('Platform name must not be empty');
    expect(() => createPlatform('   ')).toThrow('Platform name must not be empty');
  });

  it('compares platforms', () => {
    const a = createPlatform('Switch');
    const b = createPlatform('Switch');
    const c = createPlatform('PS5');

    expect(platformEquals(a, b)).toBe(true);
    expect(platformEquals(a, c)).toBe(false);
  });
});

describe('Region', () => {
  it('creates region with trimmed name', () => {
    const region = createRegion('  NTSC-USA  ');
    expect(region.name).toBe('NTSC-USA');
  });

  it('throws on empty name', () => {
    expect(() => createRegion('')).toThrow('Region name must not be empty');
  });

  it('compares regions', () => {
    const a = createRegion('NTSC-USA');
    const b = createRegion('NTSC-USA');
    const c = createRegion('PAL-EUR');

    expect(regionEquals(a, b)).toBe(true);
    expect(regionEquals(a, c)).toBe(false);
  });
});
