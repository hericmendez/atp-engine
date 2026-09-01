import type { GameId } from '../shared/ids.js';
import type { Game } from './game.js';
import type { ClassificationCategory } from '../shared/classification-category.js';
import type { MetadataCompleteness } from '../shared/metadata-completeness.js';

export interface FindByExternalIdentifierInput {
  source: string;
  externalId: string;
}

export type GameSortField =
  'title' | 'createdAt' | 'updatedAt' | 'completeness' | 'releaseDate' | 'name';
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
  readonly releaseYear?: number;
  readonly releaseYearFrom?: number;
  readonly releaseYearTo?: number;
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
