import { GameModel } from '../infrastructure/persistence/mongodb/game-schema.js';

export interface ExportGameRecord {
  readonly domainId: string;
  readonly title: string;
  readonly platforms: readonly string[];
  readonly releaseYear: number | null;
  readonly genres: readonly string[];
  readonly developers: readonly string[];
  readonly publishers: readonly string[];
  readonly description: string | null;
  readonly coverUrl: string | null;
  readonly classification: string;
  readonly completeness: string;
  readonly gameType: string | null;
  readonly gameStatus: string | null;
  readonly externalIdentifiers: readonly { source: string; id: string }[];
}

export interface PlatformGamesExportQuery {
  readonly platformName: string;
}

const PROJECTION = {
  domainId: 1,
  titles: 1,
  releases: 1,
  genres: 1,
  developers: 1,
  publishers: 1,
  description: 1,
  cover: 1,
  classification: 1,
  completeness: 1,
  gameType: 1,
  gameStatus: 1,
  externalIdentifiers: 1,
} as const;

export function buildExportFilter(platformName: string): Record<string, unknown> {
  return {
    'releases.platform.name': platformName,
    classification: 'GAME',
    domainId: { $not: /^atp-unknown-/ },
  };
}

export function toExportRecord(doc: {
  domainId: string;
  titles: { value: string; type: string }[];
  releases: { platform: { name: string }; releaseDate: { year: number } | null }[];
  genres: { name: string }[];
  developers: { name: string }[];
  publishers: { name: string }[];
  description: string | null;
  cover: { url: string } | null;
  classification: string;
  completeness: string;
  gameType: string | null;
  gameStatus: string | null;
  externalIdentifiers: { source: string; id: string }[];
}, platformName: string): ExportGameRecord {
  const title = doc.titles.find((t) => t.type === 'primary')?.value ?? doc.titles[0]?.value ?? '';
  const platforms = [...new Set(doc.releases.map((r) => r.platform.name))];
  // releaseYear derived from releases matching platformName, earliest year deterministically
  const matchingYears = doc.releases
    .filter((r) => r.platform.name === platformName && r.releaseDate?.year)
    .map((r) => r.releaseDate!.year)
    .sort((a, b) => a - b);
  const releaseYear = matchingYears.length > 0 ? matchingYears[0] : null;
  return {
    domainId: doc.domainId,
    title,
    platforms,
    releaseYear,
    genres: doc.genres.map((g) => g.name),
    developers: doc.developers.map((d) => d.name),
    publishers: doc.publishers.map((p) => p.name),
    description: doc.description,
    coverUrl: doc.cover?.url ?? null,
    classification: doc.classification,
    completeness: doc.completeness,
    gameType: doc.gameType,
    gameStatus: doc.gameStatus,
    externalIdentifiers: doc.externalIdentifiers,
  };
}

export function getExportCursor(platformName: string) {
  const filter = buildExportFilter(platformName);
  // Use lean + cursor for streaming, sorted deterministically
  return GameModel.find(filter, PROJECTION).sort({ domainId: 1 }).cursor();
}
