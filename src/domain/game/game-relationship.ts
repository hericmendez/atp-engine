import type { GameId } from '../shared/ids.js';
import type { GameRelationshipType } from '../shared/game-relationship-type.js';

export interface GameRelationship {
  readonly sourceGameId: GameId;
  readonly targetGameId: GameId;
  readonly type: GameRelationshipType;
}

export interface CreateGameRelationshipInput {
  sourceGameId: GameId;
  targetGameId: GameId;
  type: GameRelationshipType;
}

export function createGameRelationship(input: CreateGameRelationshipInput): GameRelationship {
  if (input.sourceGameId === input.targetGameId) {
    throw new Error('A game cannot have a relationship with itself');
  }
  return {
    sourceGameId: input.sourceGameId,
    targetGameId: input.targetGameId,
    type: input.type,
  };
}

export function gameRelationshipEquals(a: GameRelationship, b: GameRelationship): boolean {
  return (
    a.sourceGameId === b.sourceGameId && a.targetGameId === b.targetGameId && a.type === b.type
  );
}
