import { describe, it, expect } from 'vitest';
import { checkReclassification } from '../../src/eligibility/reclassification-guard.js';

describe('checkReclassification', () => {
  it('same values are compatible', () => {
    expect(
      checkReclassification(
        { gameType: 'main_game', gameStatus: 'released' },
        { gameType: 'main_game', gameStatus: 'released' },
      ),
    ).toEqual({ kind: 'compatible' });
  });

  it('stored nulls (legacy) with incoming known values are compatible', () => {
    expect(
      checkReclassification(
        { gameType: null, gameStatus: null },
        { gameType: 'main_game', gameStatus: 'released' },
      ),
    ).toEqual({ kind: 'compatible' });
  });

  it('stored known values with incoming nulls are compatible (preserve stored)', () => {
    expect(
      checkReclassification(
        { gameType: 'main_game', gameStatus: 'released' },
        { gameType: null, gameStatus: null },
      ),
    ).toEqual({ kind: 'compatible' });
  });

  it('both null is compatible', () => {
    expect(
      checkReclassification({ gameType: null, gameStatus: null }, { gameType: null, gameStatus: null }),
    ).toEqual({ kind: 'compatible' });
  });

  it('blank strings count as missing, not as values', () => {
    expect(
      checkReclassification(
        { gameType: 'main_game', gameStatus: 'released' },
        { gameType: '   ', gameStatus: undefined },
      ),
    ).toEqual({ kind: 'compatible' });
  });

  it('gameType change alone is a conflict', () => {
    const verdict = checkReclassification(
      { gameType: 'main_game', gameStatus: 'released' },
      { gameType: 'remake', gameStatus: 'released' },
    );

    expect(verdict.kind).toBe('conflict');
    if (verdict.kind === 'conflict') {
      expect(verdict.changedFields).toEqual(['gameType']);
    }
  });

  it('gameStatus change alone is a conflict', () => {
    const verdict = checkReclassification(
      { gameType: 'main_game', gameStatus: 'released' },
      { gameType: 'main_game', gameStatus: 'cancelled' },
    );

    expect(verdict.kind).toBe('conflict');
    if (verdict.kind === 'conflict') {
      expect(verdict.changedFields).toEqual(['gameStatus']);
    }
  });

  it('both changing is a conflict listing both fields', () => {
    const verdict = checkReclassification(
      { gameType: 'main_game', gameStatus: 'released' },
      { gameType: 'port', gameStatus: 'rumored' },
    );

    expect(verdict.kind).toBe('conflict');
    if (verdict.kind === 'conflict') {
      expect(verdict.changedFields).toEqual(['gameType', 'gameStatus']);
      expect(verdict.storedType).toBe('main_game');
      expect(verdict.incomingType).toBe('port');
    }
  });

  it('is deterministic across repeated calls', () => {
    const stored = { gameType: 'main_game', gameStatus: 'released' };
    const incoming = { gameType: 'remake', gameStatus: 'released' };
    expect(checkReclassification(stored, incoming)).toEqual(
      checkReclassification({ ...stored }, { ...incoming }),
    );
  });
});
