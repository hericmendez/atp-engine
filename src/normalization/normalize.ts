import type { Platform } from '../domain/shared/platform.js';
import type { Region } from '../domain/shared/region.js';
import type { ReleaseDate } from '../domain/shared/release-date.js';
import type { Organization } from '../domain/shared/organization.js';
import type { Genre } from '../domain/shared/genre.js';
import type { ExternalIdentifier } from '../domain/shared/external-identifier.js';
import type { DistributionChannel } from '../domain/shared/distribution-channel.js';
import type { Launcher } from '../domain/shared/launcher.js';
import {
  type NormalizedCandidate,
  type NormalizedTitle,
  type NormalizedRelease,
  type NormalizedClassificationHint,
  type Provenance,
  type TitleType,
} from './normalized-candidate.js';
import {
  resolvePlatformAlias,
  resolvePlatformFamily,
  resolvePlatformType,
} from './platform-aliases.js';
import { resolveRegionAlias } from './region-aliases.js';

export function normalizeTitle(input: string, type: TitleType = 'primary'): NormalizedTitle {
  let value = input.trim();

  value = value.replace(/\s+/g, ' ');
  value = value.replace(/\u201c|\u201d/g, '"');
  value = value.replace(/\u2018|\u2019/g, "'");
  value = value.replace(/\u00A0/g, ' ');
  value = value.replace(/\u200B/g, '');

  value = value.replace(/\s+([:;,.!?])/g, '$1');
  value = value.replace(/\(\s+/g, '(');
  value = value.replace(/\s+\)/g, ')');

  value = value.replace(/\band\b/gi, '&');

  return { value, type };
}

export function normalizeTitleType(raw: string | undefined): TitleType {
  if (!raw) return 'primary';

  const lower = raw.trim().toLowerCase();

  const aliasMap: Record<string, TitleType> = {
    primary: 'primary',
    main: 'primary',
    default: 'primary',
    official: 'primary',
    original: 'primary',
    alternate: 'alternate',
    alt: 'alternate',
    alias: 'alternate',
    aka: 'alternate',
    localized: 'localized',
    local: 'localized',
    region: 'localized',
    abbreviated: 'abbreviated',
    abbr: 'abbreviated',
    short: 'abbreviated',
    acronym: 'abbreviated',
  };

  return aliasMap[lower] ?? 'primary';
}

export function normalizeReleaseDate(input: unknown): ReleaseDate | null {
  if (input === null || input === undefined) return null;

  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.year === 'number') {
      const year = obj.year;
      const month = typeof obj.month === 'number' ? obj.month : undefined;
      const day = typeof obj.day === 'number' ? obj.day : undefined;
      return createSafeReleaseDate(year, month, day);
    }
  }

  if (typeof input === 'number') {
    const year = Math.floor(input);
    return createSafeReleaseDate(year);
  }

  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = isoMatch[2] ? parseInt(isoMatch[2], 10) : undefined;
    const day = isoMatch[3] ? parseInt(isoMatch[3], 10) : undefined;
    return createSafeReleaseDate(year, month, day);
  }

  const monthNames: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  const monthNameMatch = trimmed.match(
    /^(?:([a-z]+)\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})\s+([a-z]+),?\s+(\d{4})|([a-z]+)\s+(\d{4}))$/i,
  );

  if (monthNameMatch) {
    if (monthNameMatch[1] && monthNameMatch[2] && monthNameMatch[3]) {
      const month = monthNames[monthNameMatch[1].toLowerCase()];
      const day = parseInt(monthNameMatch[2], 10);
      const year = parseInt(monthNameMatch[3], 10);
      if (month) return createSafeReleaseDate(year, month, day);
    } else if (monthNameMatch[4] && monthNameMatch[5] && monthNameMatch[6]) {
      const day = parseInt(monthNameMatch[4], 10);
      const month = monthNames[monthNameMatch[5].toLowerCase()];
      const year = parseInt(monthNameMatch[6], 10);
      if (month) return createSafeReleaseDate(year, month, day);
    } else if (monthNameMatch[7] && monthNameMatch[8]) {
      const month = monthNames[monthNameMatch[7].toLowerCase()];
      const year = parseInt(monthNameMatch[8], 10);
      if (month) return createSafeReleaseDate(year, month);
    }
  }

  const yearOnlyMatch = trimmed.match(/(\d{4})/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1], 10);
    return createSafeReleaseDate(year);
  }

  return null;
}

function createSafeReleaseDate(year: number, month?: number, day?: number): ReleaseDate | null {
  if (!Number.isInteger(year) || year < 1950 || year > 2100) return null;
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) return null;
  if (day !== undefined && (!Number.isInteger(day) || day < 1 || day > 31)) return null;

  const hasMonth = month !== undefined && month !== null;
  const hasDay = day !== undefined && day !== null;

  return {
    year,
    month: hasMonth ? month : null,
    day: hasDay ? day : null,
    precision: hasDay ? 'day' : hasMonth ? 'month' : 'year',
  };
}

export function normalizePlatform(input: string): Platform {
  const resolved = resolvePlatformAlias(input);
  const family = resolvePlatformFamily(input);
  const type = resolvePlatformType(input);
  return { name: resolved, family, type };
}

export function normalizeRegion(input: string): Region {
  const resolved = resolveRegionAlias(input);
  return { name: resolved };
}

export function normalizeOrganization(input: string): Organization {
  let value = input.trim();
  value = value.replace(/\s+/g, ' ');

  value = value.replace(
    /\b(inc\.?|l\.?l\.?c\.?|l\.?t\.?d\.?|corp\.?|gmbh|k\.?k\.?|co\.?|company)\b\.?$/gi,
    '',
  );

  if (!value) {
    value = input.trim();
  }

  value = value.replace(/[.,;:]+$/g, '');
  value = value.replace(/,\s*$/, '');
  value = value.trim();

  return { name: value };
}

export function normalizeGenre(input: string): Genre {
  let value = input.trim();
  value = value.replace(/\s+/g, ' ');
  value = value.toLowerCase();

  return { name: value };
}

export function normalizeExternalIdentifier(source: string, id: string): ExternalIdentifier {
  return {
    source: source.trim(),
    id: id.trim(),
  };
}

export function normalizeDistributionChannel(input: string): DistributionChannel {
  return { name: input.trim() };
}

export function normalizeLauncher(input: string): Launcher {
  return { name: input.trim() };
}

export function normalizeProvenance(
  source: string,
  sourceId: string,
  rawTitle: string | null = null,
): Provenance {
  return {
    source: source.trim(),
    sourceId: sourceId.trim(),
    retrievedAt: new Date().toISOString(),
    rawTitle,
  };
}

export interface RawCandidateInput {
  title?: string;
  titleType?: string;
  titles?: readonly { value: string; type?: string }[];
  developers?: readonly string[];
  publishers?: readonly string[];
  genres?: readonly string[];
  platforms?: readonly string[];
  regions?: readonly string[];
  releaseDate?: unknown;
  version?: string;
  edition?: string;
  distributionChannels?: readonly string[];
  launchers?: readonly string[];
  externalIdentifiers?: readonly { source: string; id: string }[];
  description?: string;
  classificationHints?: readonly { category: string; confidence: number; evidence: string }[];
}

export function normalizeCandidate(
  input: RawCandidateInput,
  source: string,
  sourceId: string,
): NormalizedCandidate {
  const titles: NormalizedTitle[] = [];

  if (input.titles && input.titles.length > 0) {
    for (const t of input.titles) {
      titles.push(normalizeTitle(t.value, normalizeTitleType(t.type)));
    }
  } else if (input.title) {
    titles.push(normalizeTitle(input.title, normalizeTitleType(input.titleType)));
  }

  if (titles.length === 0) {
    throw new Error('NormalizedCandidate must have at least one title');
  }

  const developers: Organization[] = (input.developers ?? []).map(normalizeOrganization);
  const publishers: Organization[] = (input.publishers ?? []).map(normalizeOrganization);
  const genres: Genre[] = (input.genres ?? []).map(normalizeGenre);

  const externalIdentifiers: ExternalIdentifier[] = (input.externalIdentifiers ?? []).map((ei) =>
    normalizeExternalIdentifier(ei.source, ei.id),
  );

  const releases: NormalizedRelease[] = [];
  const releaseDate = normalizeReleaseDate(input.releaseDate);
  const version = input.version?.trim() ?? null;
  const edition = input.edition?.trim() ?? null;
  const distributionChannels: DistributionChannel[] = (input.distributionChannels ?? []).map(
    normalizeDistributionChannel,
  );
  const launchers: Launcher[] = (input.launchers ?? []).map(normalizeLauncher);

  const platformNames = input.platforms ?? [];
  const regionNames = input.regions ?? [];

  if (platformNames.length === 0) {
    releases.push({
      platform: { name: 'UNKNOWN', family: null, type: 'other' },
      region: null,
      releaseDate,
      version,
      edition,
      distributionChannels,
      launchers,
      externalIdentifiers: [],
    });
  } else {
    for (const platformName of platformNames) {
      const platform = normalizePlatform(platformName);

      if (regionNames.length === 0) {
        releases.push({
          platform,
          region: null,
          releaseDate,
          version,
          edition,
          distributionChannels,
          launchers,
          externalIdentifiers: [],
        });
      } else {
        for (const regionName of regionNames) {
          releases.push({
            platform,
            region: normalizeRegion(regionName),
            releaseDate,
            version,
            edition,
            distributionChannels,
            launchers,
            externalIdentifiers: [],
          });
        }
      }
    }
  }

  const classificationHints: NormalizedClassificationHint[] = (input.classificationHints ?? []).map(
    (h) => ({
      category: h.category.trim(),
      confidence: h.confidence,
      evidence: h.evidence.trim(),
    }),
  );

  const description = input.description?.trim() ?? null;

  return {
    titles,
    developers,
    publishers,
    genres,
    releases,
    externalIdentifiers,
    classificationHints,
    description,
    provenance: normalizeProvenance(source, sourceId, input.title ?? null),
  };
}
