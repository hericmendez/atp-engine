import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  splitCsvRows,
  parsePlatformManifestCsv,
  normalizePlatformName,
  manifestIdentityKey,
  isSameManifestPlatform,
  validateManifestEntry,
} from '../../src/platform-manifest/platform-manifest.js';
import { PLATFORM_MANIFEST } from '../../src/platform-manifest/platforms.js';

const HEADER = 'platform,gamesCount,peopleCount,companiesCount,startYear,endYear';

// ─── CSV reader ────────────────────────────────────────────────

describe('splitCsvRows', () => {
  it('parses simple rows with a trailing newline', () => {
    expect(splitCsvRows('a,b\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('parses quoted fields containing commas and escaped quotes', () => {
    expect(splitCsvRows('"Commodore 16, Plus/4",3996\n"Say ""hi""",3\n')).toEqual([
      ['Commodore 16, Plus/4', '3996'],
      ['Say "hi"', '3'],
    ]);
  });

  it('parses CRLF line endings', () => {
    expect(splitCsvRows('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('throws on unbalanced quotes', () => {
    expect(() => splitCsvRows('"abc,def\n')).toThrow('unbalanced quotes');
  });
});

// ─── Parsing ───────────────────────────────────────────────────

describe('parsePlatformManifestCsv', () => {
  it('parses a valid file with whitespace and unicode', () => {
    const csv =
      `${HEADER}\n` +
      '"  3DO  ",256,5990,308,1993,1996\n' +
      'Pokémon Mini,105,68,21,2001,2002\n';
    const { entries, errors } = parsePlatformManifestCsv(csv);
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      { source: 'mobygames', name: '3DO', expectedGames: 256 },
      { source: 'mobygames', name: 'Pokémon Mini', expectedGames: 105 },
    ]);
  });

  it('collapses inner whitespace in names', () => {
    expect(normalizePlatformName('  Super   NES  ')).toBe('Super NES');
  });

  it('reports rows with wrong column counts', () => {
    const { entries, errors } = parsePlatformManifestCsv(`${HEADER}\nPS4,100\n`);
    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(2);
  });

  it('reports invalid and empty names and counts', () => {
    const csv =
      `${HEADER}\n` +
      ',100,1,1,2000,2001\n' +
      'PS4,many,1,1,2000,2001\n' +
      'PS4,-5,1,1,2000,2001\n';
    const { entries, errors } = parsePlatformManifestCsv(csv);
    expect(entries).toEqual([]);
    expect(errors).toHaveLength(3);
  });

  it('detects duplicate platforms deterministically', () => {
    const csv =
      `${HEADER}\n` +
      'PS4,100,1,1,2000,2001\n' +
      'ps4 ,200,1,1,2000,2001\n';
    const { entries, errors } = parsePlatformManifestCsv(csv);
    expect(entries).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('duplicate');
  });

  it('rejects input without the expected header', () => {
    const { entries, errors } = parsePlatformManifestCsv('name,count\nPS4,100\n');
    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
  });

  it('never invents provider ids', () => {
    const { entries } = parsePlatformManifestCsv(`${HEADER}\nPS4,100,1,1,2000,2001\n`);
    expect(entries[0].sourcePlatformId).toBeUndefined();
  });
});

// ─── Identity ──────────────────────────────────────────────────

describe('manifest identity', () => {
  it('same source + same id is the same platform', () => {
    expect(
      isSameManifestPlatform(
        { source: 'igdb', sourcePlatformId: 48 },
        { source: 'igdb', sourcePlatformId: 48 },
      ),
    ).toBe(true);
    expect(
      manifestIdentityKey({ source: 'igdb', sourcePlatformId: 48 }),
    ).toBe('igdb:48');
  });

  it('different sources are never the same platform', () => {
    expect(
      isSameManifestPlatform(
        { source: 'igdb', sourcePlatformId: 48 },
        { source: 'mobygames', sourcePlatformId: 48 },
      ),
    ).toBe(false);
  });

  it('different names without ids are not equal and have no key', () => {
    const a = { source: 'mobygames', sourcePlatformId: undefined };
    const b = { source: 'mobygames', sourcePlatformId: undefined };
    expect(isSameManifestPlatform(a, b)).toBe(false);
    expect(manifestIdentityKey(a)).toBeNull();
  });
});

// ─── Integrity ─────────────────────────────────────────────────

describe('validateManifestEntry', () => {
  it('accepts a valid entry', () => {
    expect(
      validateManifestEntry({ source: 'mobygames', name: 'PS4', expectedGames: 100 }),
    ).toBeNull();
  });

  it('rejects empty source/name, negative counts and bad ids', () => {
    expect(validateManifestEntry({ source: '', name: 'PS4', expectedGames: 1 })).not.toBeNull();
    expect(validateManifestEntry({ source: 'm', name: '  ', expectedGames: 1 })).not.toBeNull();
    expect(validateManifestEntry({ source: 'm', name: 'PS4', expectedGames: -1 })).not.toBeNull();
    expect(
      validateManifestEntry({ source: 'm', name: 'PS4', expectedGames: 1.5 }),
    ).not.toBeNull();
    expect(
      validateManifestEntry({ source: 'm', name: 'PS4', expectedGames: 1, sourcePlatformId: 0 }),
    ).not.toBeNull();
  });
});

// ─── Real CSV ──────────────────────────────────────────────────

describe('real platforms.csv', () => {
  it('parses 347 valid rows with zero errors and matches the manifest', () => {
    const csvPath = path.join(process.cwd(), 'platforms.csv');
    const text = fs.readFileSync(csvPath, 'utf-8');
    const { entries, errors } = parsePlatformManifestCsv(text);

    expect(errors).toEqual([]);
    expect(entries).toHaveLength(347);
    expect([...entries]).toEqual([...PLATFORM_MANIFEST]);

    const byName = new Map(entries.map((e) => [e.name, e]));
    expect(byName.get('3DO')).toMatchObject({ source: 'mobygames', expectedGames: 256 });
    expect(byName.get('PlayStation 4')).toMatchObject({
      source: 'mobygames',
      expectedGames: 12190,
    });
    for (const entry of PLATFORM_MANIFEST) {
      expect(validateManifestEntry(entry)).toBeNull();
    }
  });
});
