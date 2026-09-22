import type { GameId } from '../shared/ids.js';
import type { Game } from './game.js';
import type { ClassificationCategory } from '../shared/classification-category.js';
import type { MetadataCompleteness } from '../shared/metadata-completeness.js';

export interface FindByExternalIdentifierInput {
  source: string;
  externalId: string;
}

export type GameSortField =
  'title' | 'createdAt' | 'updatedAt' | 'completeness' | 'releaseDate' | 'name' | 'domainId';
export type GameSortDirection = 'asc' | 'desc';

export interface GameSort {
  field: GameSortField;
  direction: GameSortDirection;
}

export interface GameQuery {
  readonly search?: string;
  readonly title?: string;
  readonly platform?: string;
  readonly platforms?: string[];
  readonly platformFamily?: string;
  readonly developer?: string;
  readonly developers?: string[];
  readonly publisher?: string;
  readonly publishers?: string[];
  readonly genre?: string;
  readonly genres?: string[];
  readonly classification?: ClassificationCategory;
  readonly completeness?: MetadataCompleteness;
  /**
   * Company-enrichment need: developers.length === 0 OR
   * publishers.length === 0, restricted to canonical games with a valid
   * IGDB external identity (atp-unknown-* never match). Implemented as
   * a Mongo-side filter (no full-collection Node filtering).
   */
  readonly needsCompanies?: boolean;
  /**
   * Cover-enrichment need: cover === null, restricted to canonical games
   * with a valid IGDB external identity (atp-unknown-* never match).
   */
  readonly needsCover?: boolean;
  /**
   * Description-enrichment need: description is null/empty/whitespace,
   * restricted to canonical games (atp-unknown-* never match).
   */
  readonly needsDescription?: boolean;
  /**
   * Cursor paging over a deterministic domainId ordering: only games
   * with domainId strictly greater than this value match. Combined
   * with sort {field:'domainId',direction:'asc'} it re-queries the live
   * selection per batch, so documents that stop matching mid-run
   * (e.g. enriched games leaving the need-set) can never cause skips.
   */
  readonly afterDomainId?: string;
  readonly releaseYear?: number;
  readonly releaseYearFrom?: number;
  readonly releaseYearTo?: number;
  readonly hasCover?: boolean;
  readonly hasDescription?: boolean;
  readonly hasDevelopers?: boolean;
  readonly hasPublishers?: boolean;
  readonly page?: number;
  readonly limit?: number;
  readonly sort?: GameSort;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

export interface GameRepository {
  findById(id: GameId): Promise<Game | null>;

  findByExternalIdentifier(input: FindByExternalIdentifierInput): Promise<Game | null>;

  existsByExternalIdentifier(input: FindByExternalIdentifierInput): Promise<boolean>;

  existsById(id: GameId): Promise<boolean>;

  findMany(query: GameQuery): Promise<PaginatedResult<Game>>;

  save(game: Game): Promise<void>;

  update(game: Game): Promise<void>;

  deleteById(id: GameId): Promise<void>;
}
