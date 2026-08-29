import { describe, it, expect } from 'vitest';
import {
  createGameId,
  createGameRelationship,
  gameRelationshipEquals,
  GameRelationshipType,
} from '../../src/domain/index.js';

describe('GameRelationship', () => {
  const g1 = createGameId('g1');
  const g2 = createGameId('g2');

  it('creates a valid relationship', () => {
    const rel = createGameRelationship({
      sourceGameId: g1,
      targetGameId: g2,
      type: GameRelationshipType.REMAKE,
    });

    expect(rel.sourceGameId).toBe(g1);
    expect(rel.targetGameId).toBe(g2);
    expect(rel.type).toBe('REMAKE');
  });

  it('throws when creating self-relationship', () => {
    expect(() =>
      createGameRelationship({
        sourceGameId: g1,
        targetGameId: g1,
        type: GameRelationshipType.PORT,
      }),
    ).toThrow('A game cannot have a relationship with itself');
  });

  it('compares relationships for equality', () => {
    const a = createGameRelationship({
      sourceGameId: g1,
      targetGameId: g2,
      type: GameRelationshipType.REMASTER,
    });
    const b = createGameRelationship({
      sourceGameId: g1,
      targetGameId: g2,
      type: GameRelationshipType.REMASTER,
    });
    const c = createGameRelationship({
      sourceGameId: g1,
      targetGameId: g2,
      type: GameRelationshipType.PORT,
    });

    expect(gameRelationshipEquals(a, b)).toBe(true);
    expect(gameRelationshipEquals(a, c)).toBe(false);
  });

  it('supports all relationship types', () => {
    const types = Object.values(GameRelationshipType);
    expect(types).toContain('REMAKE');
    expect(types).toContain('REMASTER');
    expect(types).toContain('ENHANCED_VERSION');
    expect(types).toContain('PORT');
    expect(types).toContain('EXPANSION');
    expect(types).toContain('REGIONAL_RELEASE');
    expect(types).toContain('ALTERNATE_TITLE');
    expect(types).toContain('RELATED_GAME');
  });
});
