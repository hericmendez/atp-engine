import { describe, it, expect } from 'vitest';
import {
  normalizeTitle,
  normalizeTitleType,
  normalizeReleaseDate,
  normalizePlatform,
  normalizeRegion,
  normalizeOrganization,
  normalizeGenre,
  normalizeExternalIdentifier,
  normalizeDistributionChannel,
  normalizeLauncher,
  normalizeCandidate,
  resolvePlatformFamily,
} from '../../src/normalization/index.js';

describe('normalizeTitle', () => {
  it('trims whitespace', () => {
    expect(normalizeTitle('  Resident Evil 4  ')).toEqual({
      value: 'Resident Evil 4',
      type: 'primary',
    });
  });

  it('collapses multiple spaces', () => {
    expect(normalizeTitle('Final  Fantasy   Tactics')).toEqual({
      value: 'Final Fantasy Tactics',
      type: 'primary',
    });
  });

  it('normalizes curly quotes to straight quotes', () => {
    expect(normalizeTitle('Mario Party \u201cSuperstars\u201d')).toEqual({
      value: 'Mario Party "Superstars"',
      type: 'primary',
    });
  });

  it('removes zero-width spaces', () => {
    expect(normalizeTitle('Zelda\u200B: Tears')).toEqual({
      value: 'Zelda: Tears',
      type: 'primary',
    });
  });

  it('removes non-breaking spaces', () => {
    expect(normalizeTitle('Final\u00A0Fantasy')).toEqual({
      value: 'Final Fantasy',
      type: 'primary',
    });
  });

  it('moves punctuation after space to directly after word', () => {
    expect(normalizeTitle('Resident Evil 4 : Gold Edition')).toEqual({
      value: 'Resident Evil 4: Gold Edition',
      type: 'primary',
    });
  });

  it('removes space before closing paren', () => {
    expect(normalizeTitle('Game ( Remastered )')).toEqual({
      value: 'Game (Remastered)',
      type: 'primary',
    });
  });

  it('normalizes "and" to "&"', () => {
    expect(normalizeTitle('Tom and Jerry')).toEqual({
      value: 'Tom & Jerry',
      type: 'primary',
    });
  });

  it('preserves title type when provided', () => {
    const result = normalizeTitle('RE4', 'alternate');
    expect(result.type).toBe('alternate');
  });

  it('preserves CJK characters', () => {
    expect(normalizeTitle('\u3055\u3082\u308a\u3056\u308f\u3084')).toEqual({
      value: '\u3055\u3082\u308a\u3056\u308f\u3084',
      type: 'primary',
    });
  });
});

describe('normalizeTitleType', () => {
  it('returns primary for undefined', () => {
    expect(normalizeTitleType(undefined)).toBe('primary');
  });

  it('returns primary for empty string', () => {
    expect(normalizeTitleType('')).toBe('primary');
  });

  it('maps "main" to primary', () => {
    expect(normalizeTitleType('main')).toBe('primary');
  });

  it('maps "official" to primary', () => {
    expect(normalizeTitleType('official')).toBe('primary');
  });

  it('maps "alt" to alternate', () => {
    expect(normalizeTitleType('alt')).toBe('alternate');
  });

  it('maps "aka" to alternate', () => {
    expect(normalizeTitleType('aka')).toBe('alternate');
  });

  it('maps "local" to localized', () => {
    expect(normalizeTitleType('local')).toBe('localized');
  });

  it('maps "short" to abbreviated', () => {
    expect(normalizeTitleType('short')).toBe('abbreviated');
  });

  it('defaults to primary for unknown types', () => {
    expect(normalizeTitleType('unknown')).toBe('primary');
  });
});

describe('normalizeReleaseDate', () => {
  it('returns null for null', () => {
    expect(normalizeReleaseDate(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeReleaseDate(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeReleaseDate('')).toBeNull();
  });

  it('parses ISO date string', () => {
    expect(normalizeReleaseDate('2005-10-12')).toEqual({
      year: 2005,
      month: 10,
      day: 12,
      precision: 'day',
    });
  });

  it('parses ISO year-month', () => {
    expect(normalizeReleaseDate('2023-03')).toEqual({
      year: 2023,
      month: 3,
      day: null,
      precision: 'month',
    });
  });

  it('parses ISO year only', () => {
    expect(normalizeReleaseDate('2023')).toEqual({
      year: 2023,
      month: null,
      day: null,
      precision: 'year',
    });
  });

  it('parses "Month Day, Year" format', () => {
    expect(normalizeReleaseDate('October 12, 2005')).toEqual({
      year: 2005,
      month: 10,
      day: 12,
      precision: 'day',
    });
  });

  it('parses "Day Month Year" format', () => {
    expect(normalizeReleaseDate('12 October 2005')).toEqual({
      year: 2005,
      month: 10,
      day: 12,
      precision: 'day',
    });
  });

  it('parses "Month Year" format', () => {
    expect(normalizeReleaseDate('March 2023')).toEqual({
      year: 2023,
      month: 3,
      day: null,
      precision: 'month',
    });
  });

  it('parses year from string with other text', () => {
    expect(normalizeReleaseDate('Released in 2005')).toEqual({
      year: 2005,
      month: null,
      day: null,
      precision: 'year',
    });
  });

  it('parses number input', () => {
    expect(normalizeReleaseDate(2005)).toEqual({
      year: 2005,
      month: null,
      day: null,
      precision: 'year',
    });
  });

  it('parses object input', () => {
    expect(normalizeReleaseDate({ year: 2023, month: 3, day: 10 })).toEqual({
      year: 2023,
      month: 3,
      day: 10,
      precision: 'day',
    });
  });

  it('returns null for invalid year', () => {
    expect(normalizeReleaseDate('1800')).toBeNull();
  });

  it('returns null for invalid month', () => {
    expect(normalizeReleaseDate('2023-13')).toBeNull();
  });

  it('returns null for invalid day', () => {
    expect(normalizeReleaseDate('2023-01-32')).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(normalizeReleaseDate('not a date')).toBeNull();
  });

  it('parses abbreviated month names', () => {
    expect(normalizeReleaseDate('Jan 15, 2023')).toEqual({
      year: 2023,
      month: 1,
      day: 15,
      precision: 'day',
    });
  });
});

describe('normalizePlatform', () => {
  it('normalizes "ps4" to PlayStation 4 with family', () => {
    expect(normalizePlatform('ps4')).toEqual({ name: 'PlayStation 4', family: 'PlayStation' });
  });

  it('normalizes "PS4" to PlayStation 4 with family', () => {
    expect(normalizePlatform('PS4')).toEqual({ name: 'PlayStation 4', family: 'PlayStation' });
  });

  it('normalizes "xbox360" to Xbox 360 with family', () => {
    expect(normalizePlatform('xbox360')).toEqual({ name: 'Xbox 360', family: 'Xbox' });
  });

  it('normalizes "switch" to Nintendo Switch with family', () => {
    expect(normalizePlatform('switch')).toEqual({ name: 'Nintendo Switch', family: 'Nintendo' });
  });

  it('normalizes "pc" to PC with family', () => {
    expect(normalizePlatform('pc')).toEqual({ name: 'PC', family: 'PC' });
  });

  it('normalizes "windows" to Windows with PC family (not PC itself)', () => {
    expect(normalizePlatform('windows')).toEqual({ name: 'Windows', family: 'PC' });
  });

  it('normalizes "linux" to Linux with PC family', () => {
    expect(normalizePlatform('linux')).toEqual({ name: 'Linux', family: 'PC' });
  });

  it('normalizes "mac" to macOS with PC family', () => {
    expect(normalizePlatform('mac')).toEqual({ name: 'macOS', family: 'PC' });
  });

  it('preserves "steam" as-is (distribution channel, not platform)', () => {
    expect(normalizePlatform('steam')).toEqual({ name: 'steam', family: null });
  });

  it('preserves "epic games" as-is (distribution channel, not platform)', () => {
    expect(normalizePlatform('epic games')).toEqual({ name: 'epic games', family: null });
  });

  it('preserves "gog" as-is (distribution channel, not platform)', () => {
    expect(normalizePlatform('gog')).toEqual({ name: 'gog', family: null });
  });

  it('normalizes "mega drive" to Sega Genesis with Sega family', () => {
    expect(normalizePlatform('mega drive')).toEqual({ name: 'Sega Genesis', family: 'Sega' });
  });

  it('normalizes "3ds" to Nintendo 3DS with family', () => {
    expect(normalizePlatform('3ds')).toEqual({ name: 'Nintendo 3DS', family: 'Nintendo' });
  });

  it('normalizes "wii u" to Wii U with family', () => {
    expect(normalizePlatform('wii u')).toEqual({ name: 'Wii U', family: 'Nintendo' });
  });

  it('normalizes "xbox series x" to Xbox Series X with family', () => {
    expect(normalizePlatform('xbox series x')).toEqual({ name: 'Xbox Series X', family: 'Xbox' });
  });

  it('normalizes "ios" to iOS with Mobile family', () => {
    expect(normalizePlatform('ios')).toEqual({ name: 'iOS', family: 'Mobile' });
  });

  it('normalizes "android" to Android with Mobile family', () => {
    expect(normalizePlatform('android')).toEqual({ name: 'Android', family: 'Mobile' });
  });

  it('normalizes "arcade" to Arcade with null family', () => {
    expect(normalizePlatform('arcade')).toEqual({ name: 'Arcade', family: null });
  });

  it('preserves unknown platform names with null family', () => {
    expect(normalizePlatform('Custom Console')).toEqual({ name: 'Custom Console', family: null });
  });
});

describe('normalizeRegion', () => {
  it('normalizes "na" to North America', () => {
    expect(normalizeRegion('na')).toEqual({ name: 'North America' });
  });

  it('normalizes "usa" to North America', () => {
    expect(normalizeRegion('usa')).toEqual({ name: 'North America' });
  });

  it('normalizes "eu" to Europe', () => {
    expect(normalizeRegion('eu')).toEqual({ name: 'Europe' });
  });

  it('normalizes "jp" to Japan', () => {
    expect(normalizeRegion('jp')).toEqual({ name: 'Japan' });
  });

  it('normalizes "latam" to Latin America', () => {
    expect(normalizeRegion('latam')).toEqual({ name: 'Latin America' });
  });

  it('normalizes "ww" to Worldwide', () => {
    expect(normalizeRegion('ww')).toEqual({ name: 'Worldwide' });
  });

  it('normalizes "regionfree" to Region Free', () => {
    expect(normalizeRegion('regionfree')).toEqual({ name: 'Region Free' });
  });

  it('normalizes "asia" to Asia', () => {
    expect(normalizeRegion('asia')).toEqual({ name: 'Asia' });
  });

  it('normalizes "au" to Australia', () => {
    expect(normalizeRegion('au')).toEqual({ name: 'Australia' });
  });

  it('preserves unknown region names', () => {
    expect(normalizeRegion('Custom Region')).toEqual({ name: 'Custom Region' });
  });
});

describe('normalizeOrganization', () => {
  it('trims whitespace', () => {
    expect(normalizeOrganization('  Capcom  ')).toEqual({ name: 'Capcom' });
  });

  it('collapses multiple spaces', () => {
    expect(normalizeOrganization('Square  Enix')).toEqual({ name: 'Square Enix' });
  });

  it('removes trailing "Inc"', () => {
    expect(normalizeOrganization('Naughty Dog Inc')).toEqual({ name: 'Naughty Dog' });
  });

  it('removes trailing "LLC"', () => {
    expect(normalizeOrganization('Studio LLC')).toEqual({ name: 'Studio' });
  });

  it('removes trailing "Ltd"', () => {
    expect(normalizeOrganization('Studio Ltd')).toEqual({ name: 'Studio' });
  });

  it('preserves "Insomniac Games" (Games is part of the name)', () => {
    expect(normalizeOrganization('Insomniac Games')).toEqual({ name: 'Insomniac Games' });
  });

  it('preserves "Rockstar Games" (Games is part of the name)', () => {
    expect(normalizeOrganization('Rockstar Games')).toEqual({ name: 'Rockstar Games' });
  });

  it('preserves "FromSoftware" (no suffix)', () => {
    expect(normalizeOrganization('FromSoftware')).toEqual({ name: 'FromSoftware' });
  });

  it('preserves "Nintendo" (no suffix)', () => {
    expect(normalizeOrganization('Nintendo')).toEqual({ name: 'Nintendo' });
  });

  it('preserves "Valve" (no suffix)', () => {
    expect(normalizeOrganization('Valve')).toEqual({ name: 'Valve' });
  });

  it('preserves "Warner Bros. Games" (Games is part of the name)', () => {
    expect(normalizeOrganization('Warner Bros. Games')).toEqual({ name: 'Warner Bros. Games' });
  });

  it('removes trailing legal suffixes from compound names', () => {
    expect(normalizeOrganization('Capcom Co., Ltd.')).toEqual({ name: 'Capcom Co.' });
  });

  it('removes trailing comma', () => {
    expect(normalizeOrganization('Capcom,')).toEqual({ name: 'Capcom' });
  });

  it('removes trailing period', () => {
    expect(normalizeOrganization('Co.')).toEqual({ name: 'Co' });
  });

  it('preserves organizations without suffixes', () => {
    expect(normalizeOrganization('FromSoftware')).toEqual({ name: 'FromSoftware' });
  });
});

describe('normalizeGenre', () => {
  it('lowercases genre', () => {
    expect(normalizeGenre('Action')).toEqual({ name: 'action' });
  });

  it('collapses whitespace', () => {
    expect(normalizeGenre('Role   Playing')).toEqual({ name: 'role playing' });
  });

  it('preserves "puzzles" without singularization', () => {
    expect(normalizeGenre('Puzzles')).toEqual({ name: 'puzzles' });
  });

  it('preserves "sports" without singularization', () => {
    expect(normalizeGenre('Sports')).toEqual({ name: 'sports' });
  });

  it('preserves "fps" as-is', () => {
    expect(normalizeGenre('FPS')).toEqual({ name: 'fps' });
  });

  it('preserves single-word genres', () => {
    expect(normalizeGenre('RPG')).toEqual({ name: 'rpg' });
  });

  it('preserves "strategies" without broken singularization', () => {
    expect(normalizeGenre('Strategies')).toEqual({ name: 'strategies' });
  });

  it('preserves "actions" without broken singularization', () => {
    expect(normalizeGenre('Actions')).toEqual({ name: 'actions' });
  });

  it('preserves "fighting" as-is', () => {
    expect(normalizeGenre('Fighting')).toEqual({ name: 'fighting' });
  });

  it('preserves "action rpg" compound genre', () => {
    expect(normalizeGenre('Action RPG')).toEqual({ name: 'action rpg' });
  });

  it('preserves "role-playing" genre with hyphen', () => {
    expect(normalizeGenre('Role-Playing')).toEqual({ name: 'role-playing' });
  });
});

describe('normalizeExternalIdentifier', () => {
  it('trims whitespace from source and id', () => {
    expect(normalizeExternalIdentifier('  Steam  ', '  12345  ')).toEqual({
      source: 'Steam',
      id: '12345',
    });
  });

  it('preserves empty values without throwing', () => {
    expect(normalizeExternalIdentifier('Steam', '12345')).toEqual({
      source: 'Steam',
      id: '12345',
    });
  });
});

describe('normalizeCandidate', () => {
  it('normalizes a basic candidate', () => {
    const result = normalizeCandidate(
      {
        title: 'Resident Evil 4',
        developers: ['Capcom'],
        genres: ['Action'],
        platforms: ['PS4'],
        regions: ['na'],
        releaseDate: '2005-10-12',
      },
      'wikipedia',
      'wiki-123',
    );

    expect(result.titles).toEqual([{ value: 'Resident Evil 4', type: 'primary' }]);
    expect(result.developers).toEqual([{ name: 'Capcom' }]);
    expect(result.genres).toEqual([{ name: 'action' }]);
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].platform).toEqual({ name: 'PlayStation 4', family: 'PlayStation' });
    expect(result.releases[0].region).toEqual({ name: 'North America' });
    expect(result.releases[0].releaseDate).toEqual({
      year: 2005,
      month: 10,
      day: 12,
      precision: 'day',
    });
    expect(result.provenance.source).toBe('wikipedia');
    expect(result.provenance.sourceId).toBe('wiki-123');
  });

  it('throws when no titles provided', () => {
    expect(() => normalizeCandidate({}, 'source', 'id')).toThrow(
      'NormalizedCandidate must have at least one title',
    );
  });

  it('handles multiple titles', () => {
    const result = normalizeCandidate(
      {
        titles: [
          { value: 'RE4', type: 'abbreviated' },
          { value: 'Resident Evil 4', type: 'primary' },
        ],
      },
      'source',
      'id',
    );

    expect(result.titles).toHaveLength(2);
    expect(result.titles[0].type).toBe('abbreviated');
    expect(result.titles[1].type).toBe('primary');
  });

  it('creates releases for multiple platforms', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['PS4', 'Xbox One'],
      },
      'source',
      'id',
    );

    expect(result.releases).toHaveLength(2);
    expect(result.releases[0].platform.name).toBe('PlayStation 4');
    expect(result.releases[1].platform.name).toBe('Xbox One');
  });

  it('creates releases for platform-region combinations', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['PS4', 'Xbox One'],
        regions: ['na', 'eu'],
      },
      'source',
      'id',
    );

    expect(result.releases).toHaveLength(4);
  });

  it('creates a single release with UNKNOWN platform when no platforms given', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
      },
      'source',
      'id',
    );

    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].platform.name).toBe('UNKNOWN');
    expect(result.releases[0].region).toBeNull();
  });

  it('includes version and edition in releases', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['PS4'],
        version: '1.0.0',
        edition: 'Deluxe',
      },
      'source',
      'id',
    );

    expect(result.releases[0].version).toBe('1.0.0');
    expect(result.releases[0].edition).toBe('Deluxe');
  });

  it('normalizes external identifiers', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        externalIdentifiers: [{ source: 'Steam', id: '12345' }],
      },
      'source',
      'id',
    );

    expect(result.externalIdentifiers).toEqual([{ source: 'Steam', id: '12345' }]);
  });

  it('normalizes publishers', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        publishers: ['Bandai Namco'],
      },
      'source',
      'id',
    );

    expect(result.publishers).toEqual([{ name: 'Bandai Namco' }]);
  });

  it('normalizes genres', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        genres: ['RPG', 'Action', 'Strategy'],
      },
      'source',
      'id',
    );

    expect(result.genres).toEqual([{ name: 'rpg' }, { name: 'action' }, { name: 'strategy' }]);
  });
});

describe('idempotence', () => {
  it('normalizing title twice produces same result', () => {
    const first = normalizeTitle('  Resident Evil 4  ');
    const second = normalizeTitle(first.value);
    expect(first).toEqual(second);
  });

  it('normalizing platform twice produces same result', () => {
    const first = normalizePlatform('ps4');
    const second = normalizePlatform(first.name);
    expect(first).toEqual(second);
  });

  it('normalizing region twice produces same result', () => {
    const first = normalizeRegion('na');
    const second = normalizeRegion(first.name);
    expect(first).toEqual(second);
  });

  it('normalizing org twice produces same result', () => {
    const first = normalizeOrganization('Capcom');
    const second = normalizeOrganization(first.name);
    expect(first).toEqual(second);
  });

  it('normalizing genre twice produces same result', () => {
    const first = normalizeGenre('RPG');
    const second = normalizeGenre(first.name);
    expect(first).toEqual(second);
  });
});

describe('resolvePlatformFamily', () => {
  it('returns PlayStation family for PS4', () => {
    expect(resolvePlatformFamily('ps4')).toBe('PlayStation');
  });

  it('returns PlayStation family for PS5', () => {
    expect(resolvePlatformFamily('ps5')).toBe('PlayStation');
  });

  it('returns Xbox family for Xbox One', () => {
    expect(resolvePlatformFamily('xbox one')).toBe('Xbox');
  });

  it('returns Xbox family for Xbox Series X', () => {
    expect(resolvePlatformFamily('xbox series x')).toBe('Xbox');
  });

  it('returns Nintendo family for Switch', () => {
    expect(resolvePlatformFamily('switch')).toBe('Nintendo');
  });

  it('returns Nintendo family for Wii', () => {
    expect(resolvePlatformFamily('wii')).toBe('Nintendo');
  });

  it('returns PC family for Windows', () => {
    expect(resolvePlatformFamily('windows')).toBe('PC');
  });

  it('returns PC family for Linux', () => {
    expect(resolvePlatformFamily('linux')).toBe('PC');
  });

  it('returns PC family for macOS', () => {
    expect(resolvePlatformFamily('macos')).toBe('PC');
  });

  it('returns Sega family for Genesis', () => {
    expect(resolvePlatformFamily('genesis')).toBe('Sega');
  });

  it('returns Mobile family for iOS', () => {
    expect(resolvePlatformFamily('ios')).toBe('Mobile');
  });

  it('returns Mobile family for Android', () => {
    expect(resolvePlatformFamily('android')).toBe('Mobile');
  });

  it('returns null for unknown platform', () => {
    expect(resolvePlatformFamily('steam')).toBeNull();
  });

  it('returns null for distribution channel', () => {
    expect(resolvePlatformFamily('epic games')).toBeNull();
  });

  it('returns null for GOG', () => {
    expect(resolvePlatformFamily('gog')).toBeNull();
  });
});

describe('normalizeDistributionChannel', () => {
  it('trims whitespace', () => {
    expect(normalizeDistributionChannel('  Steam  ')).toEqual({ name: 'Steam' });
  });

  it('preserves name as-is', () => {
    expect(normalizeDistributionChannel('Steam')).toEqual({ name: 'Steam' });
  });

  it('preserves Epic Games Store', () => {
    expect(normalizeDistributionChannel('Epic Games Store')).toEqual({ name: 'Epic Games Store' });
  });

  it('preserves GOG', () => {
    expect(normalizeDistributionChannel('GOG')).toEqual({ name: 'GOG' });
  });

  it('preserves Physical', () => {
    expect(normalizeDistributionChannel('Physical')).toEqual({ name: 'Physical' });
  });
});

describe('normalizeLauncher', () => {
  it('trims whitespace', () => {
    expect(normalizeLauncher('  Steam Client  ')).toEqual({ name: 'Steam Client' });
  });

  it('preserves name as-is', () => {
    expect(normalizeLauncher('Steam Client')).toEqual({ name: 'Steam Client' });
  });

  it('preserves Epic Launcher', () => {
    expect(normalizeLauncher('Epic Launcher')).toEqual({ name: 'Epic Launcher' });
  });

  it('preserves GOG Galaxy', () => {
    expect(normalizeLauncher('GOG Galaxy')).toEqual({ name: 'GOG Galaxy' });
  });
});

describe('distribution channels in normalizeCandidate', () => {
  it('includes distribution channels in releases', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['PC'],
        distributionChannels: ['Steam', 'GOG'],
      },
      'source',
      'id',
    );

    expect(result.releases[0].distributionChannels).toEqual([{ name: 'Steam' }, { name: 'GOG' }]);
  });

  it('includes launchers in releases', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['PC'],
        launchers: ['Steam Client', 'GOG Galaxy'],
      },
      'source',
      'id',
    );

    expect(result.releases[0].launchers).toEqual([
      { name: 'Steam Client' },
      { name: 'GOG Galaxy' },
    ]);
  });

  it('distributes channels to all platform releases', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['PS4', 'Xbox One'],
        distributionChannels: ['PlayStation Store'],
      },
      'source',
      'id',
    );

    expect(result.releases).toHaveLength(2);
    expect(result.releases[0].distributionChannels).toEqual([{ name: 'PlayStation Store' }]);
    expect(result.releases[1].distributionChannels).toEqual([{ name: 'PlayStation Store' }]);
  });

  it('handles empty distribution channels', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['PS4'],
      },
      'source',
      'id',
    );

    expect(result.releases[0].distributionChannels).toEqual([]);
    expect(result.releases[0].launchers).toEqual([]);
  });
});

describe('PC platform semantics', () => {
  it('Windows is distinct from PC', () => {
    const windows = normalizePlatform('windows');
    const pc = normalizePlatform('pc');
    expect(windows.name).toBe('Windows');
    expect(pc.name).toBe('PC');
    expect(windows.name).not.toBe(pc.name);
  });

  it('Linux is distinct from PC', () => {
    const linux = normalizePlatform('linux');
    const pc = normalizePlatform('pc');
    expect(linux.name).toBe('Linux');
    expect(pc.name).toBe('PC');
    expect(linux.name).not.toBe(pc.name);
  });

  it('macOS is distinct from PC', () => {
    const mac = normalizePlatform('mac');
    const pc = normalizePlatform('pc');
    expect(mac.name).toBe('macOS');
    expect(pc.name).toBe('PC');
    expect(mac.name).not.toBe(pc.name);
  });

  it('all PC family platforms share the same family', () => {
    const windows = normalizePlatform('windows');
    const linux = normalizePlatform('linux');
    const mac = normalizePlatform('mac');
    const pc = normalizePlatform('pc');
    expect(windows.family).toBe('PC');
    expect(linux.family).toBe('PC');
    expect(mac.family).toBe('PC');
    expect(pc.family).toBe('PC');
  });

  it('Steam is not a platform', () => {
    const steam = normalizePlatform('steam');
    expect(steam.family).toBeNull();
  });

  it('Epic Games is not a platform', () => {
    const epic = normalizePlatform('epic games');
    expect(epic.family).toBeNull();
  });

  it('GOG is not a platform', () => {
    const gog = normalizePlatform('gog');
    expect(gog.family).toBeNull();
  });
});

describe('mobile platform semantics', () => {
  it('Android is distinct from Google Play', () => {
    const android = normalizePlatform('android');
    const googlePlay = normalizePlatform('google play');
    expect(android.name).toBe('Android');
    expect(android.family).toBe('Mobile');
    expect(googlePlay.name).toBe('google play');
    expect(googlePlay.family).toBeNull();
  });

  it('iOS is distinct from App Store', () => {
    const ios = normalizePlatform('ios');
    const appStore = normalizePlatform('app store');
    expect(ios.name).toBe('iOS');
    expect(ios.family).toBe('Mobile');
    expect(appStore.name).toBe('app store');
    expect(appStore.family).toBeNull();
  });

  it('Android and iOS share Mobile family', () => {
    const android = normalizePlatform('android');
    const ios = normalizePlatform('ios');
    expect(android.family).toBe('Mobile');
    expect(ios.family).toBe('Mobile');
    expect(android.name).not.toBe(ios.name);
  });

  it('Google Play is not a platform', () => {
    const googlePlay = normalizePlatform('google play');
    expect(googlePlay.family).toBeNull();
  });

  it('F-Droid is not a platform', () => {
    const fdroid = normalizePlatform('f-droid');
    expect(fdroid.family).toBeNull();
  });

  it('Amazon Appstore is not a platform', () => {
    const amazon = normalizePlatform('amazon appstore');
    expect(amazon.family).toBeNull();
  });

  it('APK is not a platform', () => {
    const apk = normalizePlatform('apk');
    expect(apk.family).toBeNull();
  });

  it('App Store is not a platform', () => {
    const appStore = normalizePlatform('app store');
    expect(appStore.family).toBeNull();
  });

  it('Samsung Galaxy Store is not a platform', () => {
    const samsung = normalizePlatform('samsung galaxy store');
    expect(samsung.family).toBeNull();
  });

  it('Huawei AppGallery is not a platform', () => {
    const huawei = normalizePlatform('huawei appgallery');
    expect(huawei.family).toBeNull();
  });

  it('Mobile as platform resolves to Mobile family', () => {
    const mobile = normalizePlatform('mobile');
    expect(mobile.name).toBe('Mobile');
    expect(mobile.family).toBe('Mobile');
  });

  it('Windows Phone is in Mobile family', () => {
    const wp = normalizePlatform('windows phone');
    expect(wp.name).toBe('Windows Phone');
    expect(wp.family).toBe('Mobile');
  });

  it('Android with multiple distribution channels', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['Android'],
        distributionChannels: ['Google Play', 'F-Droid', 'Direct APK'],
      },
      'source',
      'id',
    );
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].platform.name).toBe('Android');
    expect(result.releases[0].platform.family).toBe('Mobile');
    expect(result.releases[0].distributionChannels).toEqual([
      { name: 'Google Play' },
      { name: 'F-Droid' },
      { name: 'Direct APK' },
    ]);
  });

  it('iOS with App Store distribution', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['iOS'],
        distributionChannels: ['Apple App Store'],
      },
      'source',
      'id',
    );
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].platform.name).toBe('iOS');
    expect(result.releases[0].platform.family).toBe('Mobile');
    expect(result.releases[0].distributionChannels).toEqual([{ name: 'Apple App Store' }]);
  });

  it('package identifier is external identifier, not platform', () => {
    const result = normalizeCandidate(
      {
        title: 'Game',
        platforms: ['Android'],
        externalIdentifiers: [{ source: 'google-play', id: 'com.example.game' }],
      },
      'source',
      'id',
    );
    expect(result.releases[0].platform.name).toBe('Android');
    expect(result.externalIdentifiers).toEqual([{ source: 'google-play', id: 'com.example.game' }]);
  });

  it('delisted game remains valid release', () => {
    const result = normalizeCandidate(
      {
        title: 'Delisted Game',
        platforms: ['Android'],
        distributionChannels: ['Google Play'],
      },
      'source',
      'id',
    );
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].distributionChannels).toEqual([{ name: 'Google Play' }]);
  });

  it('direct APK release without store', () => {
    const result = normalizeCandidate(
      {
        title: 'Indie Game',
        platforms: ['Android'],
        distributionChannels: ['Direct APK'],
      },
      'source',
      'id',
    );
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].distributionChannels).toEqual([{ name: 'Direct APK' }]);
  });

  it('Android application is not automatically GAME', () => {
    const result = normalizeCandidate(
      {
        title: 'Utility App',
        platforms: ['Android'],
      },
      'source',
      'id',
    );
    expect(result.genres).toHaveLength(0);
  });

  it('mobile port follows same identity principles', () => {
    const result = normalizeCandidate(
      {
        title: 'Classic Game',
        platforms: ['Android', 'iOS'],
      },
      'source',
      'id',
    );
    expect(result.releases).toHaveLength(2);
    expect(result.releases[0].platform.name).toBe('Android');
    expect(result.releases[1].platform.name).toBe('iOS');
  });
});

describe('RE4 2005 vs 2023 preserved as separate entries', () => {
  it('different release dates remain distinct', () => {
    const re4_2005 = normalizeCandidate(
      {
        title: 'Resident Evil 4',
        releaseDate: '2005-10-12',
        platforms: ['PS2'],
      },
      'source',
      're4-2005',
    );

    const re4_2023 = normalizeCandidate(
      {
        title: 'Resident Evil 4',
        releaseDate: '2023-03-24',
        platforms: ['PS5'],
      },
      'source',
      're4-2023',
    );

    expect(re4_2005.releases[0].releaseDate?.year).toBe(2005);
    expect(re4_2023.releases[0].releaseDate?.year).toBe(2023);
    expect(re4_2005.provenance.sourceId).toBe('re4-2005');
    expect(re4_2023.provenance.sourceId).toBe('re4-2023');
  });
});

describe('FFT title preserved', () => {
  it('does not modify special characters in titles', () => {
    const result = normalizeTitle('Final Fantasy Tactics');
    expect(result.value).toBe('Final Fantasy Tactics');
  });

  it('preserves subtitle in title', () => {
    const result = normalizeTitle('Final Fantasy Tactics: The War of the Lions');
    expect(result.value).toBe('Final Fantasy Tactics: The War of the Lions');
  });

  it('preserves Ivalice Chronicles subtitle', () => {
    const result = normalizeTitle('Final Fantasy Tactics: The Ivalice Chronicles');
    expect(result.value).toBe('Final Fantasy Tactics: The Ivalice Chronicles');
  });

  it('FF Tactics and War of the Lions remain distinct', () => {
    const base = normalizeTitle('Final Fantasy Tactics');
    const lotl = normalizeTitle('Final Fantasy Tactics: The War of the Lions');
    expect(base.value).not.toBe(lotl.value);
  });

  it('FF Tactics and Ivalice Chronicles remain distinct', () => {
    const base = normalizeTitle('Final Fantasy Tactics');
    const ic = normalizeTitle('Final Fantasy Tactics: The Ivalice Chronicles');
    expect(base.value).not.toBe(ic.value);
  });

  it('War of the Lions and Ivalice Chronicles remain distinct', () => {
    const lotl = normalizeTitle('Final Fantasy Tactics: The War of the Lions');
    const ic = normalizeTitle('Final Fantasy Tactics: The Ivalice Chronicles');
    expect(lotl.value).not.toBe(ic.value);
  });
});

describe('RE4 2005 vs 2023 title boundary', () => {
  it('years in parentheses are preserved', () => {
    const re4_2005 = normalizeTitle('Resident Evil 4 (2005)');
    const re4_2023 = normalizeTitle('Resident Evil 4 (2023)');
    expect(re4_2005.value).toBe('Resident Evil 4 (2005)');
    expect(re4_2023.value).toBe('Resident Evil 4 (2023)');
    expect(re4_2005.value).not.toBe(re4_2023.value);
  });

  it('remake marker in title is preserved', () => {
    const result = normalizeTitle('Resident Evil 4 (2023 Remake)');
    expect(result.value).toBe('Resident Evil 4 (2023 Remake)');
  });
});

describe('title normalization edge cases', () => {
  it('converts "and" to "&" (lossy but intentional)', () => {
    expect(normalizeTitle('Tom and Jerry').value).toBe('Tom & Jerry');
  });

  it('preserves existing "&"', () => {
    expect(normalizeTitle('Tom & Jerry').value).toBe('Tom & Jerry');
  });

  it('handles edition markers without removing them', () => {
    expect(normalizeTitle('Game of the Year Edition').value).toBe('Game of the Year Edition');
  });

  it('handles remaster markers without removing them', () => {
    expect(normalizeTitle('Game Remastered').value).toBe('Game Remastered');
  });

  it('handles "The" prefix', () => {
    expect(normalizeTitle('The Legend of Zelda').value).toBe('The Legend of Zelda');
  });

  it('handles subtitles with colons', () => {
    expect(normalizeTitle('Halo: Combat Evolved').value).toBe('Halo: Combat Evolved');
  });

  it('handles hyphens in titles', () => {
    expect(normalizeTitle('Tekken Tag Tournament 2').value).toBe('Tekken Tag Tournament 2');
  });

  it('handles apostrophes', () => {
    expect(normalizeTitle("Assassin's Creed").value).toBe("Assassin's Creed");
  });

  it('handles em-dashes', () => {
    expect(normalizeTitle('Final Fantasy \u2014 Dissidia').value).toBe(
      'Final Fantasy \u2014 Dissidia',
    );
  });
});

describe('idempotence edge cases', () => {
  it('organization: Insomniac Games stays stable', () => {
    const first = normalizeOrganization('Insomniac Games');
    const second = normalizeOrganization(first.name);
    expect(first).toEqual(second);
  });

  it('organization: Capcom stays stable', () => {
    const first = normalizeOrganization('Capcom');
    const second = normalizeOrganization(first.name);
    expect(first).toEqual(second);
  });

  it('organization: Warner Bros. Games stays stable', () => {
    const first = normalizeOrganization('Warner Bros. Games');
    const second = normalizeOrganization(first.name);
    expect(first).toEqual(second);
  });

  it('genre: sports stays stable', () => {
    const first = normalizeGenre('Sports');
    const second = normalizeGenre(first.name);
    expect(first).toEqual(second);
  });

  it('genre: action rpg stays stable', () => {
    const first = normalizeGenre('Action RPG');
    const second = normalizeGenre(first.name);
    expect(first).toEqual(second);
  });

  it('genre: strategies stays stable', () => {
    const first = normalizeGenre('Strategies');
    const second = normalizeGenre(first.name);
    expect(first).toEqual(second);
  });

  it('title: already normalized title stays stable', () => {
    const first = normalizeTitle('Resident Evil 4');
    const second = normalizeTitle(first.value);
    expect(first).toEqual(second);
  });

  it('title: title with & stays stable', () => {
    const first = normalizeTitle('Tom & Jerry');
    const second = normalizeTitle(first.value);
    expect(first).toEqual(second);
  });
});
