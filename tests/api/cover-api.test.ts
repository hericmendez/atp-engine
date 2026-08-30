import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/interfaces/http/app.js';
import type { CatalogService } from '../../src/application/catalog-service.js';
import type { CoverService } from '../../src/application/cover-service.js';
import { CoverType } from '../../src/domain/cover/cover-candidate.js';
import { NotFoundError } from '../../src/shared/errors/errors.js';

function createMockCatalogService(): CatalogService {
  return {
    listGames: async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    searchGames: async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    getGameById: async (id: string) => {
      throw new NotFoundError(`Game with ID ${id} not found`);
    },
  };
}

describe('Cover API', () => {
  let app: ReturnType<typeof createApp>;
  let mockCoverService: CoverService;

  beforeEach(() => {
    mockCoverService = {
      searchCovers: vi.fn(),
      getGameCover: vi.fn(),
    } as unknown as CoverService;

    app = createApp({
      games: { catalogService: createMockCatalogService() },
      cover: { coverService: mockCoverService },
    });
  });

  describe('GET /api/v1/covers/search', () => {
    it('returns 200 with cover search results', async () => {
      vi.mocked(mockCoverService.searchCovers).mockResolvedValue({
        query: 'Doom Eternal',
        gameId: null,
        selected: {
          url: 'https://example.com/doom.jpg',
          source: 'wikipedia',
          sourceId: 'wp-1',
          width: 600,
          height: 900,
          type: CoverType.FRONT_COVER,
        },
        candidates: [],
        errors: [],
      });

      const res = await request(app).get('/api/v1/covers/search?q=Doom%20Eternal');

      expect(res.status).toBe(200);
      expect(res.body.data.query).toBe('Doom Eternal');
      expect(res.body.data.selected).not.toBeNull();
      expect(res.body.data.selected.url).toBe('https://example.com/doom.jpg');
    });

    it('returns 200 with selected null when no covers found', async () => {
      vi.mocked(mockCoverService.searchCovers).mockResolvedValue({
        query: 'Unknown Game',
        gameId: null,
        selected: null,
        candidates: [],
        errors: [],
      });

      const res = await request(app).get('/api/v1/covers/search?q=Unknown%20Game');

      expect(res.status).toBe(200);
      expect(res.body.data.selected).toBeNull();
    });

    it('returns 400 when query is missing', async () => {
      const res = await request(app).get('/api/v1/covers/search');

      expect(res.status).toBe(400);
    });

    it('returns 400 when query is empty', async () => {
      const res = await request(app).get('/api/v1/covers/search?q=');

      expect(res.status).toBe(400);
    });

    it('trims whitespace from query', async () => {
      vi.mocked(mockCoverService.searchCovers).mockResolvedValue({
        query: 'Doom Eternal',
        gameId: null,
        selected: null,
        candidates: [],
        errors: [],
      });

      await request(app).get('/api/v1/covers/search?q=%20%20Doom%20Eternal%20%20');

      expect(mockCoverService.searchCovers).toHaveBeenCalledWith('Doom Eternal', {
        sourceFilter: undefined,
      });
    });

    it('returns candidates and errors', async () => {
      vi.mocked(mockCoverService.searchCovers).mockResolvedValue({
        query: 'Doom Eternal',
        gameId: null,
        selected: {
          url: 'https://example.com/doom.jpg',
          source: 'wikipedia',
          sourceId: 'wp-1',
          width: 600,
          height: 900,
          type: CoverType.FRONT_COVER,
        },
        candidates: [
          {
            candidate: {
              url: 'https://example.com/doom.jpg',
              source: 'wikipedia',
              sourceId: 'wp-1',
              width: 600,
              height: 900,
              type: CoverType.FRONT_COVER,
              evidence: { source: 'wikipedia', sourceId: 'wp-1', retrievedAt: new Date() },
            },
            ranking: {
              sourceScore: 0.8,
              typeScore: 1.0,
              qualityScore: 0.8,
              aspectRatioScore: 1.0,
              relevanceScore: 0.9,
              totalScore: 0.9,
            },
          },
        ],
        errors: [
          { source: 'steam', errorType: 'network_failure', message: 'timeout', retryable: true },
        ],
      });

      const res = await request(app).get('/api/v1/covers/search?q=Doom%20Eternal');

      expect(res.status).toBe(200);
      expect(res.body.data.candidates).toHaveLength(1);
      expect(res.body.data.candidates[0].ranking.relevanceScore).toBeDefined();
      expect(res.body.data.errors).toHaveLength(1);
    });

    it('source errors do not return 500', async () => {
      vi.mocked(mockCoverService.searchCovers).mockResolvedValue({
        query: 'Doom Eternal',
        gameId: null,
        selected: null,
        candidates: [],
        errors: [
          { source: 'steam', errorType: 'network_failure', message: 'timeout', retryable: true },
          {
            source: 'wikipedia',
            errorType: 'source_unavailable',
            message: 'unavailable',
            retryable: true,
          },
        ],
      });

      const res = await request(app).get('/api/v1/covers/search?q=Doom%20Eternal');

      expect(res.status).toBe(200);
      expect(res.body.data.errors).toHaveLength(2);
    });
  });

  describe('GET /api/v1/games/:id/cover', () => {
    it('returns 200 with cover data when cover exists', async () => {
      vi.mocked(mockCoverService.getGameCover).mockResolvedValue({
        query: 'Test Game',
        gameId: 'game-1',
        selected: {
          url: 'https://example.com/cover.jpg',
          source: 'wikipedia',
          sourceId: 'wp-1',
          width: 600,
          height: 900,
          type: CoverType.FRONT_COVER,
        },
        candidates: [],
        errors: [],
      });

      const res = await request(app).get('/api/v1/games/game-1/cover');

      expect(res.status).toBe(200);
      expect(res.body.data.gameId).toBe('game-1');
      expect(res.body.data.query).toBe('Test Game');
      expect(res.body.data.selected).not.toBeNull();
      expect(res.body.data.selected.url).toBe('https://example.com/cover.jpg');
    });

    it('returns 200 with selected null when no cover found', async () => {
      vi.mocked(mockCoverService.getGameCover).mockResolvedValue({
        query: 'Test Game',
        gameId: 'game-1',
        selected: null,
        candidates: [],
        errors: [],
      });

      const res = await request(app).get('/api/v1/games/game-1/cover');

      expect(res.status).toBe(200);
      expect(res.body.data.selected).toBeNull();
    });

    it('returns 404 for non-existent game ID', async () => {
      vi.mocked(mockCoverService.getGameCover).mockRejectedValue(
        new NotFoundError('Game with ID nonexistent not found'),
      );

      const res = await request(app).get('/api/v1/games/nonexistent/cover');

      expect(res.status).toBe(404);
    });

    it('returns error response structure on failure', async () => {
      vi.mocked(mockCoverService.getGameCover).mockRejectedValue(new Error('Internal error'));

      const res = await request(app).get('/api/v1/games/game-1/cover');

      expect(res.status).toBe(500);
    });
  });
});
