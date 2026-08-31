import type { GameId } from '../../../domain/shared/ids.js';
import type { Game } from '../../../domain/game/game.js';
import type {
  GameRepository,
  FindByExternalIdentifierInput,
  GameQuery,
  PaginatedResult,
} from '../../../domain/game/game-repository.js';
import { GameModel } from './game-schema.js';
import { toDomain, toPersistence } from './game-mapper.js';
import { PersistenceError, ValidationError } from '../../../shared/errors/errors.js';
import { escapeRegex } from './escape-regex.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

interface MongoFilter {
  [key: string]: unknown;
}

export class MongoGameRepository implements GameRepository {
  async findById(id: GameId): Promise<Game | null> {
    try {
      const doc = await GameModel.findOne({ domainId: id }).lean();
      return doc ? toDomain(doc as unknown as import('./game-schema.js').GameDocument) : null;
    } catch (error) {
      throw new PersistenceError('Failed to find game by ID', { cause: error });
    }
  }

  async findByExternalIdentifier(input: FindByExternalIdentifierInput): Promise<Game | null> {
    try {
      const doc = await GameModel.findOne({
        'externalIdentifiers.source': input.source,
        'externalIdentifiers.id': input.externalId,
      }).lean();
      return doc ? toDomain(doc as unknown as import('./game-schema.js').GameDocument) : null;
    } catch (error) {
      throw new PersistenceError('Failed to find game by external identifier', { cause: error });
    }
  }

  async existsByExternalIdentifier(input: FindByExternalIdentifierInput): Promise<boolean> {
    try {
      const exists = await GameModel.exists({
        'externalIdentifiers.source': input.source,
        'externalIdentifiers.id': input.externalId,
      });
      return exists !== null;
    } catch (error) {
      throw new PersistenceError('Failed to check game existence by external identifier', {
        cause: error,
      });
    }
  }

  async existsById(id: GameId): Promise<boolean> {
    try {
      const exists = await GameModel.exists({ domainId: id });
      return exists !== null;
    } catch (error) {
      throw new PersistenceError('Failed to check game existence by ID', { cause: error });
    }
  }

  async findMany(query: GameQuery): Promise<PaginatedResult<Game>> {
    try {
      const filter = this.buildFilter(query);
      const page = query.page ?? DEFAULT_PAGE;
      const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const skip = (page - 1) * limit;

      const sort = this.buildSort(query.sort);

      const [docs, total] = await Promise.all([
        GameModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
        GameModel.countDocuments(filter),
      ]);

      const items = docs.map((doc) =>
        toDomain(doc as unknown as import('./game-schema.js').GameDocument),
      );

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new PersistenceError('Failed to find games', { cause: error });
    }
  }

  private buildFilter(query: GameQuery): MongoFilter {
    const filter: MongoFilter = {};

    if (query.search) {
      const escaped = escapeRegex(query.search);
      filter.$or = [
        { 'titles.value': { $regex: escaped, $options: 'i' } },
        { 'developers.name': { $regex: escaped, $options: 'i' } },
        { 'publishers.name': { $regex: escaped, $options: 'i' } },
      ];
    }

    if (query.title) {
      filter['titles.value'] = { $regex: escapeRegex(query.title), $options: 'i' };
    }

    if (query.platform) {
      filter['releases.platform.name'] = { $regex: escapeRegex(query.platform), $options: 'i' };
    }

    if (query.platformFamily) {
      filter['releases.platform.family'] = query.platformFamily;
    }

    if (query.developer) {
      filter['developers.name'] = { $regex: escapeRegex(query.developer), $options: 'i' };
    }

    if (query.publisher) {
      filter['publishers.name'] = { $regex: escapeRegex(query.publisher), $options: 'i' };
    }

    if (query.genre) {
      filter['genres.name'] = { $regex: escapeRegex(query.genre), $options: 'i' };
    }

    if (query.classification) {
      filter.classification = query.classification;
    }

    if (query.completeness) {
      filter.completeness = query.completeness;
    }

    if (query.releaseYear) {
      filter['releases.releaseDate.year'] = query.releaseYear;
    }

    return filter;
  }

  private buildSort(sort: GameQuery['sort']): Record<string, 1 | -1> {
    if (!sort) {
      return { updatedAt: -1 };
    }

    const fieldMap: Record<string, string> = {
      title: 'titles.value',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      completeness: 'completeness',
    };

    const direction = sort.direction === 'asc' ? 1 : -1;
    return { [fieldMap[sort.field] ?? sort.field]: direction };
  }

  async save(game: Game): Promise<void> {
    try {
      const data = toPersistence(game);
      const doc = new GameModel(data);
      await doc.save();
    } catch (error) {
      if (this.isMongoDuplicateKeyError(error)) {
        const keyPattern = this.extractDuplicateKeyPattern(error);
        if (keyPattern === 'domainId') {
          throw new ValidationError(`Game with ID ${game.id} already exists`);
        }
        throw new ValidationError('Game with this external identifier already exists');
      }

      throw new PersistenceError('Failed to save game', { cause: error });
    }
  }

  async update(game: Game): Promise<void> {
    try {
      const data = toPersistence(game);
      const result = await GameModel.updateOne({ domainId: game.id }, { $set: data });

      if (result.matchedCount === 0) {
        throw new PersistenceError(`Game with ID ${game.id} not found for update`);
      }
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw error;
      }

      if (this.isMongoDuplicateKeyError(error)) {
        throw new ValidationError('Update would create duplicate external identifier');
      }

      throw new PersistenceError('Failed to update game', { cause: error });
    }
  }

  async deleteById(id: GameId): Promise<void> {
    try {
      const result = await GameModel.deleteOne({ domainId: id });
      if (result.deletedCount === 0) {
        throw new PersistenceError(`Game with ID ${id} not found for deletion`);
      }
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError('Failed to delete game', { cause: error });
    }
  }

  private isMongoDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }

  private extractDuplicateKeyPattern(error: unknown): string | null {
    if (typeof error === 'object' && error !== null && 'keyPattern' in error) {
      const keyPattern = (error as { keyPattern: Record<string, number> }).keyPattern;
      if (keyPattern?.domainId) return 'domainId';
      if (keyPattern?.['externalIdentifiers.source']) return 'externalIdentifiers';
    }
    return null;
  }
}
