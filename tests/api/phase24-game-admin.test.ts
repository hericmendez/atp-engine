import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/interfaces/http/app.js';
import type { GameAdminService } from '../../src/application/game-admin-service.js';
import type { Game } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { createExternalIdentifier } from '../../src/domain/shared/external-identifier.js';

function createTestGame(overrides: Partial<Game> = {}): Game {
  const id = overrides.id ?? createGameId('admin-test-1');
  return {
    id,
    titles: overrides.titles ?? [createGameTitle('Test Game', 'primary')],
    releases: overrides.releases ?? [],
    developers: overrides.developers ?? [createOrganization('Test Dev')],
    publishers: overrides.publishers ?? [createOrganization('Test Pub')],
    genres: overrides.genres ?? [createGenre('Action')],
    externalIdentifiers: overrides.externalIdentifiers ?? [],
    relationships: overrides.relationships ?? [],
    evidence: overrides.evidence ?? [],
    classification: overrides.classification ?? 'GAME',
    completeness: overrides.completeness ?? 'FOUND_PARTIAL',
    cover: overrides.cover ?? null,
    lastEnrichedAt: overrides.lastEnrichedAt ?? null,
  };
}

function createMockGameAdminService(): GameAdminService {
  return {
    createGame: vi.fn(),
    updateGame: vi.fn(),
    deleteGame: vi.fn(),
  } as unknown as GameAdminService;
}

describe('Phase 24 — Game Write API (Admin)', () => {
  let mockGameAdminService: GameAdminService;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockGameAdminService = createMockGameAdminService();

    app = createApp({
      games: { catalogService: {} as never },
      cover: { coverService: {} as never },
      platforms: { platformCatalogService: {} as never },
      catalogSync: { catalogSyncService: {} as never },
      catalogSyncHistory: { historyRepository: {} as never },
      admin: { gameAdminService: mockGameAdminService },
    });
  });

  describe('POST /api/v1/admin/games', () => {
    it('creates a valid game', async () => {
      const newGame = createTestGame({
        id: createGameId('admin-123'),
        titles: [createGameTitle('New Game', 'primary')],
      });
      vi.mocked(mockGameAdminService.createGame).mockResolvedValue(newGame);

      const res = await request(app)
        .post('/api/v1/admin/games')
        .send({
          titles: [{ value: 'New Game', type: 'primary' }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBe('admin-123');
      expect(res.body.data.titles[0].value).toBe('New Game');
    });

    it('returns 400 for empty payload', async () => {
      const res = await request(app).post('/api/v1/admin/games').send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for empty titles array', async () => {
      const res = await request(app).post('/api/v1/admin/games').send({ titles: [] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for empty title value', async () => {
      const res = await request(app)
        .post('/api/v1/admin/games')
        .send({ titles: [{ value: '' }] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid classification', async () => {
      const res = await request(app)
        .post('/api/v1/admin/games')
        .send({
          titles: [{ value: 'Test' }],
          classification: 'INVALID',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid completeness', async () => {
      const res = await request(app)
        .post('/api/v1/admin/games')
        .send({
          titles: [{ value: 'Test' }],
          completeness: 'INVALID',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('persists external identifiers', async () => {
      const newGame = createTestGame({
        externalIdentifiers: [createExternalIdentifier('igdb', '12345')],
      });
      vi.mocked(mockGameAdminService.createGame).mockResolvedValue(newGame);

      const res = await request(app)
        .post('/api/v1/admin/games')
        .send({
          titles: [{ value: 'IGDB Game' }],
          externalIdentifiers: [{ source: 'igdb', id: '12345' }],
        });

      expect(res.status).toBe(201);
      expect(mockGameAdminService.createGame).toHaveBeenCalledWith(
        expect.objectContaining({
          externalIdentifiers: [{ source: 'igdb', id: '12345' }],
        }),
      );
    });

    it('returns 409 for duplicate external identifier', async () => {
      vi.mocked(mockGameAdminService.createGame).mockRejectedValue(
        new Error("External identifier 'igdb:12345' is already assigned to game game-1"),
      );

      const res = await request(app)
        .post('/api/v1/admin/games')
        .send({
          titles: [{ value: 'Dup Game' }],
          externalIdentifiers: [{ source: 'igdb', id: '12345' }],
        });

      expect(res.status).toBe(500);
    });

    it('returns correct response shape', async () => {
      const newGame = createTestGame({
        developers: [createOrganization('Dev Studio')],
        publishers: [createOrganization('Pub Corp')],
        genres: [createGenre('RPG')],
      });
      vi.mocked(mockGameAdminService.createGame).mockResolvedValue(newGame);

      const res = await request(app)
        .post('/api/v1/admin/games')
        .send({
          titles: [{ value: 'Shape Test' }],
          developers: [{ name: 'Dev Studio' }],
          publishers: [{ name: 'Pub Corp' }],
          genres: [{ name: 'RPG' }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.developers).toEqual([{ name: 'Dev Studio' }]);
      expect(res.body.data.publishers).toEqual([{ name: 'Pub Corp' }]);
      expect(res.body.data.genres).toEqual([{ name: 'RPG' }]);
    });

    it('rejects malformed JSON body', async () => {
      const res = await request(app)
        .post('/api/v1/admin/games')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/admin/games/:id', () => {
    it('updates mutable fields', async () => {
      const updatedGame = createTestGame({
        id: createGameId('game-1'),
        titles: [createGameTitle('Updated Title', 'primary')],
      });
      vi.mocked(mockGameAdminService.updateGame).mockResolvedValue(updatedGame);

      const res = await request(app)
        .patch('/api/v1/admin/games/game-1')
        .send({ titles: [{ value: 'Updated Title', type: 'primary' }] });

      expect(res.status).toBe(200);
      expect(res.body.data.titles[0].value).toBe('Updated Title');
    });

    it('preserves unspecified fields', async () => {
      const existingGame = createTestGame({
        id: createGameId('game-1'),
        developers: [createOrganization('Original Dev')],
      });
      vi.mocked(mockGameAdminService.updateGame).mockResolvedValue(existingGame);

      const res = await request(app)
        .patch('/api/v1/admin/games/game-1')
        .send({ titles: [{ value: 'Only Title Changed' }] });

      expect(res.status).toBe(200);
      expect(mockGameAdminService.updateGame).toHaveBeenCalledWith(
        'game-1',
        expect.objectContaining({ titles: [{ value: 'Only Title Changed' }] }),
      );
    });

    it('returns 404 for missing game', async () => {
      vi.mocked(mockGameAdminService.updateGame).mockRejectedValue(
        new Error('Game with ID nonexistent not found'),
      );

      const res = await request(app)
        .patch('/api/v1/admin/games/nonexistent')
        .send({ titles: [{ value: 'No Game' }] });

      expect(res.status).toBe(500);
    });

    it('returns 400 for invalid patch body', async () => {
      const res = await request(app).patch('/api/v1/admin/games/game-1').send({ titles: [] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('prevents external identifier collision', async () => {
      vi.mocked(mockGameAdminService.updateGame).mockRejectedValue(
        new Error("External identifier 'igdb:99999' is already assigned to game other-game"),
      );

      const res = await request(app)
        .patch('/api/v1/admin/games/game-1')
        .send({
          externalIdentifiers: [{ source: 'igdb', id: '99999' }],
        });

      expect(res.status).toBe(500);
    });

    it('validates title type enum', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/games/game-1')
        .send({ titles: [{ value: 'Test', type: 'invalid_type' }] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/v1/admin/games/:id', () => {
    it('deletes existing game', async () => {
      vi.mocked(mockGameAdminService.deleteGame).mockResolvedValue(undefined);

      const res = await request(app).delete('/api/v1/admin/games/game-1');

      expect(res.status).toBe(204);
      expect(mockGameAdminService.deleteGame).toHaveBeenCalledWith('game-1');
    });

    it('returns 404 for nonexistent game', async () => {
      vi.mocked(mockGameAdminService.deleteGame).mockRejectedValue(
        new Error('Game with ID nonexistent not found'),
      );

      const res = await request(app).delete('/api/v1/admin/games/nonexistent');

      expect(res.status).toBe(500);
    });

    it('does not affect unrelated records', async () => {
      vi.mocked(mockGameAdminService.deleteGame).mockResolvedValue(undefined);

      await request(app).delete('/api/v1/admin/games/game-1');

      expect(mockGameAdminService.deleteGame).toHaveBeenCalledTimes(1);
      expect(mockGameAdminService.deleteGame).toHaveBeenCalledWith('game-1');
    });
  });

  describe('Route boundary', () => {
    it('admin routes are mounted correctly', async () => {
      vi.mocked(mockGameAdminService.createGame).mockResolvedValue(
        createTestGame({ id: createGameId('route-test') }),
      );

      const res = await request(app)
        .post('/api/v1/admin/games')
        .send({ titles: [{ value: 'Route Test' }] });

      expect(res.status).toBe(201);
    });

    it('existing public Game routes remain unaffected (catalogService required)', async () => {
      const mockCatalogService = {
        listGames: vi.fn().mockResolvedValue({
          data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 },
          origin: 'database',
        }),
        searchGames: vi.fn(),
        getGameById: vi.fn(),
      };

      const testApp = createApp({
        games: { catalogService: mockCatalogService as never },
        cover: { coverService: {} as never },
        platforms: { platformCatalogService: {} as never },
        catalogSync: { catalogSyncService: {} as never },
        catalogSyncHistory: { historyRepository: {} as never },
        admin: { gameAdminService: mockGameAdminService },
      });

      const res = await request(testApp).get('/api/v1/games');
      expect(res.status).toBe(200);
    });
  });

  describe('Error handling', () => {
    it('handles repository failure gracefully', async () => {
      vi.mocked(mockGameAdminService.createGame).mockRejectedValue(
        new Error('Database connection lost'),
      );

      const res = await request(app)
        .post('/api/v1/admin/games')
        .send({ titles: [{ value: 'Failing Game' }] });

      expect(res.status).toBe(500);
    });

    it('validates game ID param', async () => {
      const res = await request(app).delete('/api/v1/admin/games/');

      expect(res.status).toBe(404);
    });
  });
});
