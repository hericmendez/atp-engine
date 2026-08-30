import type { Game } from '../../../domain/game/game.js';
import type { Release } from '../../../domain/game/release.js';
import type { Platform } from '../../../domain/shared/platform.js';
import type { PaginatedResult } from '../../../domain/game/game-repository.js';
import type { ClassificationCategory } from '../../../domain/shared/classification-category.js';
import type { MetadataCompleteness } from '../../../domain/shared/metadata-completeness.js';

export interface ReleaseDateResponse {
  year: number;
  month: number | null;
  day: number | null;
  precision: string;
}

export interface PlatformResponse {
  name: string;
  family: string | null;
  type: string;
}

export interface DistributionChannelResponse {
  name: string;
}

export interface LauncherResponse {
  name: string;
}

export interface RegionResponse {
  name: string;
}

export interface ReleaseResponse {
  id: string;
  platform: PlatformResponse;
  region: RegionResponse | null;
  releaseDate: ReleaseDateResponse | null;
  version: string | null;
  edition: string | null;
  distributionChannels: DistributionChannelResponse[];
  launchers: LauncherResponse[];
}

export interface OrganizationResponse {
  name: string;
}

export interface GenreResponse {
  name: string;
}

export interface ExternalIdentifierResponse {
  source: string;
  id: string;
}

export interface SourceEvidenceResponse {
  source: string;
  externalId: string;
  retrievedAt: string;
  rawTitle: string | null;
}

export interface GameRelationshipResponse {
  sourceGameId: string;
  targetGameId: string;
  type: string;
}

export interface GameResponse {
  id: string;
  titles: Array<{ value: string; type: string }>;
  releases: ReleaseResponse[];
  developers: OrganizationResponse[];
  publishers: OrganizationResponse[];
  genres: GenreResponse[];
  externalIdentifiers: ExternalIdentifierResponse[];
  relationships: GameRelationshipResponse[];
  evidence: SourceEvidenceResponse[];
  classification: ClassificationCategory;
  completeness: MetadataCompleteness;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface SingleResponse<T> {
  data: T;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export function toPlatformResponse(platform: Platform): PlatformResponse {
  return {
    name: platform.name,
    family: platform.family,
    type: platform.type,
  };
}

export function toReleaseResponse(release: Release): ReleaseResponse {
  return {
    id: release.id,
    platform: toPlatformResponse(release.platform),
    region: release.region ? { name: release.region.name } : null,
    releaseDate: release.releaseDate
      ? {
          year: release.releaseDate.year,
          month: release.releaseDate.month,
          day: release.releaseDate.day,
          precision: release.releaseDate.precision,
        }
      : null,
    version: release.version,
    edition: release.edition,
    distributionChannels: release.distributionChannels.map((dc) => ({ name: dc.name })),
    launchers: release.launchers.map((l) => ({ name: l.name })),
  };
}

export function toGameResponse(game: Game): GameResponse {
  return {
    id: game.id,
    titles: game.titles.map((t) => ({ value: t.value, type: t.type })),
    releases: game.releases.map(toReleaseResponse),
    developers: game.developers.map((d) => ({ name: d.name })),
    publishers: game.publishers.map((p) => ({ name: p.name })),
    genres: game.genres.map((g) => ({ name: g.name })),
    externalIdentifiers: game.externalIdentifiers.map((ei) => ({
      source: ei.source,
      id: ei.id,
    })),
    relationships: game.relationships.map((r) => ({
      sourceGameId: r.sourceGameId,
      targetGameId: r.targetGameId,
      type: r.type,
    })),
    evidence: game.evidence.map((e) => ({
      source: e.source,
      externalId: e.externalId,
      retrievedAt: e.retrievedAt.toISOString(),
      rawTitle: e.rawTitle,
    })),
    classification: game.classification,
    completeness: game.completeness,
  };
}

export function toPaginatedResponse<T, U>(
  result: PaginatedResult<T>,
  mapper: (item: T) => U,
): PaginatedResponse<U> {
  return {
    data: result.items.map(mapper),
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  };
}
