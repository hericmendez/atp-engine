import { describe, it, expect } from 'vitest';
import {
  computeEntityMatch,
  extractTrailingNumber,
  isEntityMatchValid,
} from '../../../../src/sources/wikipedia/cover/wikipedia-entity-match.js';
import { extractQueryTokens } from '../../../../src/sources/wikipedia/cover/wikipedia-cover-validation.js';

describe('Wikipedia Entity Match', () => {
  describe('extractTrailingNumber', () => {
    it('extracts number from "The Witcher 3"', () => {
      expect(extractTrailingNumber('the witcher 3')).toBe(3);
    });

    it('extracts number from "The Witcher 3: Wild Hunt"', () => {
      expect(extractTrailingNumber('the witcher 3 wild hunt')).toBeNull();
    });

    it('returns null for "Metroid Prime"', () => {
      expect(extractTrailingNumber('metroid prime')).toBeNull();
    });

    it('extracts number from "Final Fantasy VII"', () => {
      expect(extractTrailingNumber('final fantasy vii')).toBeNull();
    });

    it('extracts number from "The Witcher 2"', () => {
      expect(extractTrailingNumber('the witcher 2')).toBe(2);
    });

    it('extracts number from "Metroid Prime 3: Corruption"', () => {
      expect(extractTrailingNumber('metroid prime 3 corruption')).toBeNull();
    });

    it('extracts number from "Halo 3"', () => {
      expect(extractTrailingNumber('halo 3')).toBe(3);
    });
  });

  describe('computeEntityMatch', () => {
    it('returns 1.0 for exact match', () => {
      const tokens = extractQueryTokens('Hollow Knight');
      expect(computeEntityMatch('Hollow Knight', 'Hollow Knight', tokens)).toBe(1.0);
    });

    it('returns 0.9 for title variant (title starts with query)', () => {
      const tokens = extractQueryTokens('The Witcher 3');
      expect(computeEntityMatch('The Witcher 3: Wild Hunt', 'The Witcher 3', tokens)).toBe(0.9);
    });

    it('returns 0.8 for title variant (query starts with title)', () => {
      const tokens = extractQueryTokens('Zelda');
      expect(computeEntityMatch('Zelda', 'The Legend of Zelda', tokens)).toBe(0.8);
    });

    it('returns 0.3 for sequel mismatch (The Witcher vs The Witcher 3)', () => {
      const tokens = extractQueryTokens('The Witcher 3');
      expect(computeEntityMatch('The Witcher', 'The Witcher 3', tokens)).toBe(0.3);
    });

    it('returns 0.3 for sequel mismatch (The Witcher 3 vs The Witcher 2)', () => {
      const tokens = extractQueryTokens('The Witcher 3');
      expect(computeEntityMatch('The Witcher 2: Assassins of Kings', 'The Witcher 3', tokens)).toBe(
        0.3,
      );
    });

    it('returns 0.3 for franchise mismatch (Gwent vs The Witcher 3)', () => {
      const tokens = extractQueryTokens('The Witcher 3');
      expect(computeEntityMatch('Gwent: The Witcher Card Game', 'The Witcher 3', tokens)).toBe(0.3);
    });

    it('returns 0.9 for title variant (title starts with query)', () => {
      const tokens = extractQueryTokens('Metroid Prime');
      expect(computeEntityMatch('Metroid Prime Hunters', 'Metroid Prime', tokens)).toBe(0.9);
    });

    it('returns 0.9 for subtitle variant (Hollow Knight: Silksong)', () => {
      const tokens = extractQueryTokens('Hollow Knight');
      expect(computeEntityMatch('Hollow Knight: Silksong', 'Hollow Knight', tokens)).toBe(0.9);
    });

    it('returns 0.9 for subtitle variant (Legend of Zelda: Breath of the Wild)', () => {
      const tokens = extractQueryTokens('The Legend of Zelda');
      expect(
        computeEntityMatch(
          'The Legend of Zelda: Breath of the Wild',
          'The Legend of Zelda',
          tokens,
        ),
      ).toBe(0.9);
    });

    it('returns 0.1 for unrelated title', () => {
      const tokens = extractQueryTokens('The Witcher 3');
      expect(computeEntityMatch('Super Mario Bros', 'The Witcher 3', tokens)).toBe(0.1);
    });
  });

  describe('isEntityMatchValid', () => {
    it('returns true for score >= 0.5', () => {
      expect(isEntityMatchValid(0.5)).toBe(true);
      expect(isEntityMatchValid(0.9)).toBe(true);
      expect(isEntityMatchValid(1.0)).toBe(true);
    });

    it('returns false for score < 0.5', () => {
      expect(isEntityMatchValid(0.3)).toBe(false);
      expect(isEntityMatchValid(0.1)).toBe(false);
      expect(isEntityMatchValid(0.0)).toBe(false);
    });
  });
});
