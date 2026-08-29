import type { GameId } from '../../../domain/shared/ids.js';
import type { Game } from '../../../domain/game/game.js';
import type {
  GameRepository,
  FindByExternalIdentifierInput,
} from '../../../domain/game/game-repository.js';
import { GameModel } from './game-schema.js';
import { toDomain, toPersistence } from './game-mapper.js';
import { PersistenceError, ValidationError } from '../../../shared/errors/errors.js';

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

  async save(game: Game): Promise<void> {
    try {
      const alreadyExists = await this.existsById(game.id);
      if (alreadyExists) {
        throw new ValidationError(`Game with ID ${game.id} already exists`);
      }

      const data = toPersistence(game);
      const doc = new GameModel(data);
      await doc.save();
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      if (this.isMongoDuplicateKeyError(error)) {
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
}
