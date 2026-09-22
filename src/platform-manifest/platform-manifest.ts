/**
 * Platform Manifest — deterministic universe of ingestion platforms.
 *
 * Answers only: "which platforms exist as an ingestion universe, and how
 * many records does the reference source associate with each?"
 *
 * Explicitly NOT the catalog (canonical games), NOT quarantine, and NOT
 * a game list. `expectedGames` never belongs on `Game`.
 *
 * Identity is `source + sourcePlatformId` (e.g. `igdb:48`). The name is
 * metadata. Provider ids are never invented from names and never fuzzy
 * matched: when the reference file carries no provider id, the entry
 * simply has no `sourcePlatformId` (resolution is a future explicit
 * step, not inference).
 */

export interface PlatformManifestEntry {
  /** Reference source key, e.g. 'mobygames'. Open string on purpose:
   * future sources (igdb, wikipedia, steam, other) need no concept change. */
  readonly source: string;
  /** Provider-scoped platform id when a deterministic source provides
   * one. Absent when the reference file carries none — never invented. */
  readonly sourcePlatformId?: number;
  /** Display name from the reference source (metadata, not identity). */
  readonly name: string;
  /** Record count the reference source associates with the platform. */
  readonly expectedGames: number;
}

export interface PlatformManifestParseError {
  readonly line: number;
  readonly message: string;
}

export interface PlatformManifestParseResult {
  readonly entries: readonly PlatformManifestEntry[];
  readonly errors: readonly PlatformManifestParseError[];
}

export function normalizePlatformName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * Canonical identity string when the provider id exists, otherwise null.
 * No fuzzy derivation: a missing id stays missing.
 */
export function manifestIdentityKey(
  entry: Pick<PlatformManifestEntry, 'source' | 'sourcePlatformId'>,
): string | null {
  if (entry.sourcePlatformId === undefined || entry.sourcePlatformId === null) {
    return null;
  }
  return `${entry.source}:${entry.sourcePlatformId}`;
}

/**
 * Same platform? Same source AND same provider id. Entries without a
 * provider id are never considered equal by name here: name-only
 * matching is a future explicit resolution step, not identity.
 */
export function isSameManifestPlatform(
  a: Pick<PlatformManifestEntry, 'source' | 'sourcePlatformId'>,
  b: Pick<PlatformManifestEntry, 'source' | 'sourcePlatformId'>,
): boolean {
  if (a.source !== b.source) {
    return false;
  }
  if (a.sourcePlatformId === undefined || b.sourcePlatformId === undefined) {
    return false;
  }
  return a.sourcePlatformId === b.sourcePlatformId;
}

export function validateManifestEntry(entry: PlatformManifestEntry): string | null {
  if (typeof entry.source !== 'string' || entry.source.trim().length === 0) {
    return 'source must be a non-empty string';
  }
  if (typeof entry.name !== 'string' || normalizePlatformName(entry.name).length === 0) {
    return 'name must be a non-empty string';
  }
  if (
    !Number.isInteger(entry.expectedGames) ||
    (entry.expectedGames as number) < 0
  ) {
    return 'expectedGames must be an integer >= 0';
  }
  if (
    entry.sourcePlatformId !== undefined &&
    (!Number.isInteger(entry.sourcePlatformId) || entry.sourcePlatformId <= 0)
  ) {
    return 'sourcePlatformId must be an integer > 0 when present';
  }
  return null;
}

/**
 * Minimal deterministic RFC4180 reader: comma-separated fields,
 * double-quoted fields with "" escapes (may contain commas, quotes and
 * newlines), CRLF or LF line endings. Throws on unbalanced quotes.
 */
export function splitCsvRows(text: string): string[][] {
  // A single trailing newline terminates the last row; it is not a row.
  const stripped =
    text.endsWith('\r\n') || text.endsWith('\n') || text.endsWith('\r')
      ? text.slice(0, text.endsWith('\r\n') ? -2 : -1)
      : text;
  if (stripped.length === 0) {
    return [];
  }

  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };

  while (i < stripped.length) {
    const char = stripped[i];
    if (inQuotes) {
      if (char === '"') {
        if (stripped[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += char;
        i += 1;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
    } else if (char === ',') {
      pushField();
      i += 1;
    } else if (char === '\r' || char === '\n') {
      pushField();
      rows.push(row);
      row = [];
      i += char === '\r' && stripped[i + 1] === '\n' ? 2 : 1;
    } else {
      field += char;
      i += 1;
    }
  }

  if (inQuotes) {
    throw new Error('unbalanced quotes in CSV input');
  }
  pushField();
  rows.push(row);
  return rows;
}

const EXPECTED_HEADER = ['platform', 'gamesCount', 'peopleCount', 'companiesCount', 'startYear', 'endYear'];

/**
 * Parse the MobyGames platform reference CSV into manifest entries.
 * Only `platform` (name) and `gamesCount` (expectedGames) are consumed;
 * every other column is ignored. Duplicate platform names (after
 * normalization) and invalid rows are collected as errors — parsing
 * never silently merges or invents. No provider ids are derived: the
 * CSV carries none, so entries have no `sourcePlatformId`.
 */
export function parsePlatformManifestCsv(
  text: string,
  source = 'mobygames',
): PlatformManifestParseResult {
  const entries: PlatformManifestEntry[] = [];
  const errors: PlatformManifestParseError[] = [];

  let rows: string[][];
  try {
    rows = splitCsvRows(text);
  } catch (error) {
    return {
      entries,
      errors: [
        {
          line: 1,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  if (rows.length === 0) {
    return { entries, errors: [{ line: 1, message: 'empty CSV input' }] };
  }

  const header = rows[0].map((h) => h.trim());
  const nameIndex = header.indexOf('platform');
  const countIndex = header.indexOf('gamesCount');
  if (nameIndex === -1 || countIndex === -1) {
    return {
      entries,
      errors: [
        {
          line: 1,
          message: `expected header to contain ${EXPECTED_HEADER.join(',')}, got ${header.join(',')}`,
        },
      ],
    };
  }

  const seen = new Set<string>();
  for (let index = 1; index < rows.length; index += 1) {
    const line = index + 1;
    const row = rows[index];
    if (row.length !== header.length) {
      errors.push({
        line,
        message: `expected ${header.length} columns, got ${row.length}`,
      });
      continue;
    }
    const name = normalizePlatformName(row[nameIndex] ?? '');
    if (name.length === 0) {
      errors.push({ line, message: 'empty platform name' });
      continue;
    }
    const countText = (row[countIndex] ?? '').trim();
    if (!/^\d+$/.test(countText)) {
      errors.push({ line, message: `invalid gamesCount "${countText}"` });
      continue;
    }
    const key = `${source}::${name.toLowerCase()}`;
    if (seen.has(key)) {
      errors.push({ line, message: `duplicate platform "${name}"` });
      continue;
    }
    seen.add(key);
    entries.push({ source, name, expectedGames: Number(countText) });
  }

  return { entries, errors };
}
