import { describe, it, expect } from 'vitest';
import {
  CatalogQuerySchema,
  SearchQuerySchema,
  GameIdParamSchema,
} from '../../src/interfaces/http/validation/schemas.js';

describe('Validation Schemas', () => {
  describe('CatalogQuerySchema', () => {
    it('parses valid query with defaults', () => {
      const result = CatalogQuerySchema.parse({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.order).toBe('desc');
    });

    it('parses search parameter', () => {
      const result = CatalogQuerySchema.parse({ search: 'zelda' });

      expect(result.search).toBe('zelda');
    });

    it('parses platform parameter', () => {
      const result = CatalogQuerySchema.parse({ platform: 'Switch' });

      expect(result.platform).toBe('Switch');
    });

    it('parses classification parameter', () => {
      const result = CatalogQuerySchema.parse({ classification: 'GAME' });

      expect(result.classification).toBe('GAME');
    });

    it('parses release year parameter', () => {
      const result = CatalogQuerySchema.parse({ releaseYear: '2017' });

      expect(result.releaseYear).toBe(2017);
    });

    it('rejects invalid classification', () => {
      expect(() => CatalogQuerySchema.parse({ classification: 'INVALID' })).toThrow();
    });

    it('rejects release year out of range', () => {
      expect(() => CatalogQuerySchema.parse({ releaseYear: '1900' })).toThrow();
      expect(() => CatalogQuerySchema.parse({ releaseYear: '2200' })).toThrow();
    });

    it('rejects limit above 100', () => {
      expect(() => CatalogQuerySchema.parse({ limit: '101' })).toThrow();
    });

    it('rejects page below 1', () => {
      expect(() => CatalogQuerySchema.parse({ page: '0' })).toThrow();
    });
  });

  describe('SearchQuerySchema', () => {
    it('parses valid search query', () => {
      const result = SearchQuerySchema.parse({ q: 'zelda' });

      expect(result.q).toBe('zelda');
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('rejects empty search query', () => {
      expect(() => SearchQuerySchema.parse({ q: '' })).toThrow();
    });

    it('rejects missing search query', () => {
      expect(() => SearchQuerySchema.parse({})).toThrow();
    });
  });

  describe('GameIdParamSchema', () => {
    it('parses valid game ID', () => {
      const result = GameIdParamSchema.parse({ id: 'game-123' });

      expect(result.id).toBe('game-123');
    });

    it('rejects empty game ID', () => {
      expect(() => GameIdParamSchema.parse({ id: '' })).toThrow();
    });
  });
});
