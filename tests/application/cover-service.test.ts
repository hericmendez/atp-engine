import { describe, it, expect, vi } from 'vitest';
import { CoverService } from '../../src/application/cover-service.js';
import { createGame, createGameId, createGameTitle } from '../../src/domain/index.js';
import type { GameRepository } from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import type { CoverResult } from '../../src/domain/cover/cover-candidate.js';
import { NotFoundError } from '../../src/shared/errors/errors.js';

function createTestGame(id: string, title: string, hasCover = false): Game {
  const game = createGame({
    id: createGameId(id),
    titles: [createGameTitle(title)],
  });

  if (hasCover) {
    return {
      ...game,
      cover: {
        url: 'https://example.com/cached.jpg',
        source: 'wikipedia',
        sourceId: 'wp-cached',
        width: 600,
        height: 900,
        type: 'front_cover',
      },
    };
  }

  return game;
}

function createMockGameRepository(games: Game[]): GameRepository {
  return {
    findById: vi.fn(async (id) => games.find((g) => g.id === id) ?? null),
    findByExternalId: vi.fn(async () => null),
    findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
  } as unknown as GameRepository;
}

function createMockCoverEngine(coverResult: CoverResult) {
  return {
    searchCovers: vi.fn(async () => coverResult),
    discoverCovers: vi.fn(async () => coverResult),
  } as never;
}

describe('CoverService', () => {
  describe('searchCovers', () => {
    it('delegates to cover engine searchCovers', async () => {
      const repo = createMockGameRepository([]);
      const engine = createMockCoverEngine({
        query: 'Doom Eternal',
        gameId: null,
        selected: {
          url: 'https://example.com/doom.jpg',
          source: 'wikipedia',
          sourceId: 'wp-1',
          width: 600,
          height: 900,
          type: 'front_cover',
        },
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      const result = await service.searchCovers('Doom Eternal');

      expect(engine.searchCovers).toHaveBeenCalledWith('Doom Eternal', undefined);
      expect(result.query).toBe('Doom Eternal');
      expect(result.gameId).toBeNull();
      expect(result.selected?.url).toBe('https://example.com/doom.jpg');
    });

    it('passes options to cover engine', async () => {
      const repo = createMockGameRepository([]);
      const engine = createMockCoverEngine({
        query: 'Doom',
        gameId: null,
        selected: null,
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      await service.searchCovers('Doom', { sourceFilter: ['wikipedia'] });

      expect(engine.searchCovers).toHaveBeenCalledWith('Doom', { sourceFilter: ['wikipedia'] });
    });

    it('does not require a game to exist', async () => {
      const repo = createMockGameRepository([]);
      const engine = createMockCoverEngine({
        query: 'Doom Eternal',
        gameId: null,
        selected: null,
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      const result = await service.searchCovers('Doom Eternal');

      expect(result.gameId).toBeNull();
      expect(repo.findById).not.toHaveBeenCalled();
    });
  });

  describe('getGameCover', () => {
    it('throws NotFoundError when game does not exist', async () => {
      const repo = createMockGameRepository([]);
      const engine = createMockCoverEngine({
        query: '',
        gameId: 'missing',
        selected: null,
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      await expect(service.getGameCover('missing')).rejects.toThrow(NotFoundError);
    });

    it('returns cached cover if game already has one', async () => {
      const game = createTestGame('game-1', 'Test Game', true);
      const repo = createMockGameRepository([game]);
      const engine = createMockCoverEngine({
        query: '',
        gameId: 'game-1',
        selected: null,
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      const result = await service.getGameCover('game-1');

      expect(result.selected).not.toBeNull();
      expect(result.selected?.url).toBe('https://example.com/cached.jpg');
      expect(result.candidates).toHaveLength(0);
      expect(engine.discoverCovers).not.toHaveBeenCalled();
    });

    it('calls cover engine discoverCovers when game has no cover', async () => {
      const game = createTestGame('game-1', 'Test Game', false);
      const repo = createMockGameRepository([game]);
      const engine = createMockCoverEngine({
        query: 'Test Game',
        gameId: 'game-1',
        selected: {
          url: 'https://example.com/new.jpg',
          source: 'wikipedia',
          sourceId: 'wp-new',
          width: 800,
          height: 1200,
          type: 'front_cover',
        },
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      const result = await service.getGameCover('game-1');

      expect(engine.discoverCovers).toHaveBeenCalledWith('game-1', 'Test Game');
      expect(result.selected).not.toBeNull();
      expect(result.selected?.url).toBe('https://example.com/new.jpg');
    });

    it('persists cover to game repository when found', async () => {
      const game = createTestGame('game-1', 'Test Game', false);
      const repo = createMockGameRepository([game]);
      const engine = createMockCoverEngine({
        query: 'Test Game',
        gameId: 'game-1',
        selected: {
          url: 'https://example.com/new.jpg',
          source: 'wikipedia',
          sourceId: 'wp-new',
          width: 800,
          height: 1200,
          type: 'front_cover',
        },
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      await service.getGameCover('game-1');

      expect(repo.update).toHaveBeenCalledOnce();
      const updatedGame = (repo.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Game;
      expect(updatedGame.cover).not.toBeNull();
      expect(updatedGame.cover?.url).toBe('https://example.com/new.jpg');
    });

    it('does not persist when no cover is found', async () => {
      const game = createTestGame('game-1', 'Test Game', false);
      const repo = createMockGameRepository([game]);
      const engine = createMockCoverEngine({
        query: 'Test Game',
        gameId: 'game-1',
        selected: null,
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      await service.getGameCover('game-1');

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('returns errors from cover engine', async () => {
      const game = createTestGame('game-1', 'Test Game', false);
      const repo = createMockGameRepository([game]);
      const engine = createMockCoverEngine({
        query: 'Test Game',
        gameId: 'game-1',
        selected: null,
        candidates: [],
        errors: [
          { source: 'steam', errorType: 'network_failure', message: 'timeout', retryable: true },
        ],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      const result = await service.getGameCover('game-1');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].source).toBe('steam');
    });
  });
});
