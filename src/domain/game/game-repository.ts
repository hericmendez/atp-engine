import type { GameId } from '../shared/ids.js';
import type { Game } from './game.js';

export interface FindByExternalIdentifierInput {
  source: string;
  externalId: string;
}

export interface GameRepository {
  findById(id: GameId): Promise<Game | null>;

  findByExternalIdentifier(input: FindByExternalIdentifierInput): Promise<Game | null>;

  existsByExternalIdentifier(input: FindByExternalIdentifierInput): Promise<boolean>;

  existsById(id: GameId): Promise<boolean>;

  save(game: Game): Promise<void>;

  update(game: Game): Promise<void>;

  deleteById(id: GameId): Promise<void>;
}
