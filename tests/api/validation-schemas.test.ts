import { describe, it, expect } from 'vitest';
import {
  CatalogQuerySchema,
  SearchQuerySchema,
  GameIdParamSchema,
  CoverSearchQuerySchema,
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

  describe('CoverSearchQuerySchema', () => {
    it('parses valid query with defaults', () => {
      const result = CoverSearchQuerySchema.parse({ q: 'Doom Eternal' });

      expect(result.q).toBe('Doom Eternal');
      expect(result.type).toBe('cover');
      expect(result.limit).toBe(1);
    });

    it('parses type=cover', () => {
      const result = CoverSearchQuerySchema.parse({ q: 'Doom', type: 'cover' });

      expect(result.type).toBe('cover');
    });

    it('parses type=logo', () => {
      const result = CoverSearchQuerySchema.parse({ q: 'Doom', type: 'logo' });

      expect(result.type).toBe('logo');
    });

    it('parses type=all', () => {
      const result = CoverSearchQuerySchema.parse({ q: 'Doom', type: 'all' });

      expect(result.type).toBe('all');
    });

    it('rejects invalid type', () => {
      expect(() => CoverSearchQuerySchema.parse({ q: 'Doom', type: 'banana' })).toThrow();
    });

    it('parses limit=1', () => {
      const result = CoverSearchQuerySchema.parse({ q: 'Doom', limit: '1' });

      expect(result.limit).toBe(1);
    });

    it('parses limit=5', () => {
      const result = CoverSearchQuerySchema.parse({ q: 'Doom', limit: '5' });

      expect(result.limit).toBe(5);
    });

    it('parses limit=9', () => {
      const result = CoverSearchQuerySchema.parse({ q: 'Doom', limit: '9' });

      expect(result.limit).toBe(9);
    });

    it('rejects limit=0', () => {
      expect(() => CoverSearchQuerySchema.parse({ q: 'Doom', limit: '0' })).toThrow();
    });

    it('rejects limit=10', () => {
      expect(() => CoverSearchQuerySchema.parse({ q: 'Doom', limit: '10' })).toThrow();
    });

    it('rejects negative limit', () => {
      expect(() => CoverSearchQuerySchema.parse({ q: 'Doom', limit: '-1' })).toThrow();
    });

    it('rejects non-integer limit', () => {
      expect(() => CoverSearchQuerySchema.parse({ q: 'Doom', limit: 'abc' })).toThrow();
    });

    it('trims whitespace from query', () => {
      const result = CoverSearchQuerySchema.parse({ q: '  Doom Eternal  ' });

      expect(result.q).toBe('Doom Eternal');
    });

    it('rejects empty query', () => {
      expect(() => CoverSearchQuerySchema.parse({ q: '' })).toThrow();
    });

    it('rejects missing query', () => {
      expect(() => CoverSearchQuerySchema.parse({})).toThrow();
    });

    it('rejects query exceeding 200 chars', () => {
      const longQuery = 'a'.repeat(201);

      expect(() => CoverSearchQuerySchema.parse({ q: longQuery })).toThrow();
    });

    it('accepts query at exactly 200 chars', () => {
      const query200 = 'a'.repeat(200);

      const result = CoverSearchQuerySchema.parse({ q: query200 });

      expect(result.q).toBe(query200);
    });

    it('parses source parameter', () => {
      const result = CoverSearchQuerySchema.parse({ q: 'Doom', source: 'wikipedia' });

      expect(result.source).toBe('wikipedia');
    });

    it('parses all parameters together', () => {
      const result = CoverSearchQuerySchema.parse({
        q: 'Doom Eternal',
        type: 'logo',
        limit: '5',
        source: 'steam',
      });

      expect(result.q).toBe('Doom Eternal');
      expect(result.type).toBe('logo');
      expect(result.limit).toBe(5);
      expect(result.source).toBe('steam');
    });
  });
});
