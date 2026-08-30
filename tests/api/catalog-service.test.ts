import { describe, it, expect, beforeEach } from 'vitest';
import { CatalogService } from '../../src/application/catalog-service.js';
import type {
  GameRepository,
  GameQuery,
  PaginatedResult,
} from '../../src/domain/game/game-repository.js';
import type { Game } from '../../src/domain/game/game.js';
import { createGameId } from '../../src/domain/shared/ids.js';
import { createGameTitle } from '../../src/domain/shared/title.js';
import { createOrganization } from '../../src/domain/shared/organization.js';
import { createGenre } from '../../src/domain/shared/genre.js';
import { NotFoundError } from '../../src/shared/errors/errors.js';

function createTestGame(id: string, title: string): Game {
  return {
    id: createGameId(id),
    titles: [createGameTitle(title, 'primary')],
    releases: [],
    developers: [createOrganization('Test Developer')],
    publishers: [createOrganization('Test Publisher')],
    genres: [createGenre('Action')],
    externalIdentifiers: [],
    relationships: [],
    evidence: [],
    classification: 'GAME',
    completeness: 'FOUND_COMPLETE',
  };
}

function createMockRepository(games: Game[]): GameRepository {
  return {
    findById: async (id) => games.find((g) => g.id === id) ?? null,
    findByExternalIdentifier: async () => null,
    existsByExternalIdentifier: async () => false,
    existsById: async (id) => games.some((g) => g.id === id),
    findMany: async (query: GameQuery): Promise<PaginatedResult<Game>> => {
      let filtered = [...games];

      if (query.search) {
        const searchLower = query.search.toLowerCase();
        filtered = filtered.filter((g) =>
          g.titles.some((t) => t.value.toLowerCase().includes(searchLower)),
        );
      }

      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const start = (page - 1) * limit;
      const paginated = filtered.slice(start, start + limit);

      return {
        items: paginated,
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
      };
    },
    save: async () => {},
    update: async () => {},
    deleteById: async () => {},
  };
}

describe('CatalogService', () => {
  let games: Game[];
  let repository: GameRepository;
  let service: CatalogService;

  beforeEach(() => {
    games = [
      createTestGame('game-1', 'The Legend of Zelda'),
      createTestGame('game-2', 'Super Mario Bros'),
      createTestGame('game-3', 'Resident Evil'),
    ];
    repository = createMockRepository(games);
    service = new CatalogService({ gameRepository: repository });
  });

  describe('listGames', () => {
    it('returns paginated results', async () => {
      const result = await service.listGames({});

      expect(result.items.length).toBe(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('filters by search term', async () => {
      const result = await service.listGames({ search: 'zelda' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('game-1');
    });

    it('supports pagination', async () => {
      const result = await service.listGames({ page: 1, limit: 2 });

      expect(result.items.length).toBe(2);
      expect(result.totalPages).toBe(2);
    });
  });

  describe('searchGames', () => {
    it('searches by query', async () => {
      const result = await service.searchGames('mario');

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('game-2');
    });

    it('returns empty for non-matching search', async () => {
      const result = await service.searchGames('nonexistent');

      expect(result.items.length).toBe(0);
    });
  });

  describe('getGameById', () => {
    it('returns game by ID', async () => {
      const game = await service.getGameById('game-1');

      expect(game.id).toBe('game-1');
      expect(game.titles[0].value).toBe('The Legend of Zelda');
    });

    it('throws NotFoundError for non-existent game', async () => {
      await expect(service.getGameById('non-existent')).rejects.toThrow(NotFoundError);
    });
  });
});
