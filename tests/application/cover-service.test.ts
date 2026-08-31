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
    findByExternalIdentifier: vi.fn(async () => null),
    existsByExternalIdentifier: vi.fn(async () => false),
    existsById: vi.fn(async (id) => games.some((g) => g.id === id)),
    findMany: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 })),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    deleteById: vi.fn(async () => {}),
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
    it('delegates to cover engine and returns scraper origin', async () => {
      const repo = createMockGameRepository([]);
      const engine = createMockCoverEngine({
        query: 'Doom Eternal',
        gameId: null,
        type: 'cover',
        limit: 1,
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
      expect(result.origin).toBe('scraper');
      expect(result.data.query).toBe('Doom Eternal');
      expect(result.data.gameId).toBeNull();
      expect(result.data.selected?.url).toBe('https://example.com/doom.jpg');
    });

    it('passes options to cover engine', async () => {
      const repo = createMockGameRepository([]);
      const engine = createMockCoverEngine({
        query: 'Doom',
        gameId: null,
        type: 'logo',
        limit: 3,
        selected: null,
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      await service.searchCovers('Doom', { type: 'logo', limit: 3, sourceFilter: ['wikipedia'] });

      expect(engine.searchCovers).toHaveBeenCalledWith('Doom', {
        type: 'logo',
        limit: 3,
        sourceFilter: ['wikipedia'],
      });
    });

    it('does not require a game to exist', async () => {
      const repo = createMockGameRepository([]);
      const engine = createMockCoverEngine({
        query: 'Doom Eternal',
        gameId: null,
        type: 'cover',
        limit: 1,
        selected: null,
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      const result = await service.searchCovers('Doom Eternal');

      expect(result.data.gameId).toBeNull();
      expect(repo.findById).not.toHaveBeenCalled();
    });
  });

  describe('getGameCover', () => {
    it('throws NotFoundError when game does not exist', async () => {
      const repo = createMockGameRepository([]);
      const engine = createMockCoverEngine({
        query: '',
        gameId: 'missing',
        type: 'cover',
        limit: 1,
        selected: null,
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      await expect(service.getGameCover('missing')).rejects.toThrow(NotFoundError);
    });

    it('returns cached cover with database origin', async () => {
      const game = createTestGame('game-1', 'Test Game', true);
      const repo = createMockGameRepository([game]);
      const engine = createMockCoverEngine({
        query: '',
        gameId: 'game-1',
        type: 'cover',
        limit: 1,
        selected: null,
        candidates: [],
        errors: [],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      const result = await service.getGameCover('game-1');

      expect(result.origin).toBe('database');
      expect(result.data.selected).not.toBeNull();
      expect(result.data.selected?.url).toBe('https://example.com/cached.jpg');
      expect(result.data.candidates).toHaveLength(0);
      expect(result.data.type).toBe('cover');
      expect(result.data.limit).toBe(1);
      expect(engine.discoverCovers).not.toHaveBeenCalled();
    });

    it('calls cover engine discoverCovers with scraper origin when game has no cover', async () => {
      const game = createTestGame('game-1', 'Test Game', false);
      const repo = createMockGameRepository([game]);
      const engine = createMockCoverEngine({
        query: 'Test Game',
        gameId: 'game-1',
        type: 'cover',
        limit: 1,
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

      expect(result.origin).toBe('scraper');
      expect(engine.discoverCovers).toHaveBeenCalledWith('game-1', 'Test Game');
      expect(result.data.selected).not.toBeNull();
      expect(result.data.selected?.url).toBe('https://example.com/new.jpg');
    });

    it('persists cover to game repository when found', async () => {
      const game = createTestGame('game-1', 'Test Game', false);
      const repo = createMockGameRepository([game]);
      const engine = createMockCoverEngine({
        query: 'Test Game',
        gameId: 'game-1',
        type: 'cover',
        limit: 1,
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
        type: 'cover',
        limit: 1,
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
        type: 'cover',
        limit: 1,
        selected: null,
        candidates: [],
        errors: [
          { source: 'steam', errorType: 'network_failure', message: 'timeout', retryable: true },
        ],
      });
      const service = new CoverService({ gameRepository: repo, coverEngine: engine });

      const result = await service.getGameCover('game-1');

      expect(result.data.errors).toHaveLength(1);
      expect(result.data.errors[0].source).toBe('steam');
    });
  });
});
