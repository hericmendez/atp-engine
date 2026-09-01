import { describe, it, expect, vi } from 'vitest';
import { CatalogService } from '../src/application/catalog-service.js';
import type {
  GameRepository,
  GameQuery,
  PaginatedResult,
} from '../src/domain/game/game-repository.js';
import type { Game } from '../src/domain/game/game.js';
import { createGameId } from '../src/domain/shared/ids.js';
import { createGameTitle } from '../src/domain/shared/title.js';
import { createOrganization } from '../src/domain/shared/organization.js';
import { createGenre } from '../src/domain/shared/genre.js';
import type { DiscoveryEngine } from '../src/discovery/discovery-engine.js';
import type { DiscoveryResult } from '../src/discovery/discovery-types.js';
import { WikipediaAdapter } from '../src/sources/wikipedia/wikipedia-adapter.js';

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

function createMockRepository(games: Game[]): {
  repository: GameRepository;
  savedGames: Game[];
} {
  const savedGames: Game[] = [];
  const allGames = [...games];

  const repository: GameRepository = {
    findById: async (id) => allGames.find((g) => g.id === id) ?? null,
    findByExternalIdentifier: async (input) =>
      allGames.find((g) =>
        g.externalIdentifiers.some((e) => e.source === input.source && e.id === input.externalId),
      ) ?? null,
    existsByExternalIdentifier: async (input) =>
      allGames.some((g) =>
        g.externalIdentifiers.some((e) => e.source === input.source && e.id === input.externalId),
      ),
    existsById: async (id) => allGames.some((g) => g.id === id),
    findMany: async (query: GameQuery): Promise<PaginatedResult<Game>> => {
      let filtered = [...allGames];
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
    save: async (game) => {
      savedGames.push(game);
      allGames.push(game);
    },
    update: async (game) => {
      const idx = allGames.findIndex((g) => g.id === game.id);
      if (idx >= 0) allGames[idx] = game;
    },
    delete: async (id) => {
      const idx = allGames.findIndex((g) => g.id === id);
      if (idx >= 0) allGames.splice(idx, 1);
    },
    count: async () => allGames.length,
  };

  return { repository, savedGames };
}

function createMockDiscoveryEngine(groups: DiscoveryResult['groups'] = []): DiscoveryEngine {
  return {
    discover: async () => ({
      groups,
      metadata: { sourceCount: 0, totalObservations: 0, averageConfidence: 0 },
    }),
  } as unknown as DiscoveryEngine;
}

describe('Practical Validation Defect Fixes', () => {
  describe('P1: Duplicate prevention via core title search', () => {
    it('returns existing game when searching with platform suffix', async () => {
      const existingGame = createTestGame('g1', 'Elden Ring');
      const { repository } = createMockRepository([existingGame]);
      const discovery = createMockDiscoveryEngine([]);
      const service = new CatalogService({
        gameRepository: repository,
        discoveryEngine: discovery,
      });

      const result = await service.searchGames('Elden Ring PS5');

      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].titles[0].value).toBe('Elden Ring');
      expect(result.origin).toBe('database');
    });

    it('returns existing game when searching with version suffix', async () => {
      const existingGame = createTestGame('g1', 'Stardew Valley');
      const { repository } = createMockRepository([existingGame]);
      const discovery = createMockDiscoveryEngine([]);
      const service = new CatalogService({
        gameRepository: repository,
        discoveryEngine: discovery,
      });

      const result = await service.searchGames('Stardew Valley definitive edition');

      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].titles[0].value).toBe('Stardew Valley');
      expect(result.origin).toBe('database');
    });

    it('still falls back to discovery when no match even with core title', async () => {
      const { repository } = createMockRepository([]);
      const discovery = createMockDiscoveryEngine([]);
      const service = new CatalogService({
        gameRepository: repository,
        discoveryEngine: discovery,
      });

      const result = await service.searchGames('Brand New Game XYZ');

      expect(result.data.items).toHaveLength(0);
      expect(result.origin).toBe('scraper');
    });
  });

  describe('P1: Wikipedia search snippet classification hints', () => {
    it('extracts GAME hint from snippet containing "video game"', async () => {
      const adapter = new WikipediaAdapter({
        source: 'wikipedia',
        baseUrl: 'https://en.wikipedia.org/w/api.php',
      });

      const gameSearchResponse = {
        query: {
          search: [
            {
              pageid: 100,
              title: 'Test Game',
              snippet:
                'Test Game is a <span class="searchmatch">video game</span> developed by Studio',
              wordcount: 3000,
            },
          ],
          searchinfo: { totalhits: 1 },
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(gameSearchResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await adapter.search('Test Game');
      expect(result.candidates).toHaveLength(1);

      const hints = result.candidates[0].classificationHints ?? [];
      const gameHint = hints.find((h) => h.category === 'GAME');
      expect(gameHint).toBeDefined();
      expect(gameHint!.confidence).toBe(0.7);

      vi.restoreAllMocks();
    });

    it('extracts FILM hint from snippet containing "film"', async () => {
      const adapter = new WikipediaAdapter({
        source: 'wikipedia',
        baseUrl: 'https://en.wikipedia.org/w/api.php',
      });

      const filmSearchResponse = {
        query: {
          search: [
            {
              pageid: 200,
              title: 'Test Film',
              snippet: 'Test Film is a 2024 action horror <span class="searchmatch">film</span>',
              wordcount: 2000,
            },
          ],
          searchinfo: { totalhits: 1 },
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(filmSearchResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await adapter.search('Test Film');
      const hints = result.candidates[0].classificationHints ?? [];
      const filmHint = hints.find((h) => h.category === 'FILM');
      expect(filmHint).toBeDefined();

      vi.restoreAllMocks();
    });

    it('extracts TV_SERIES hint from snippet containing "television"', async () => {
      const adapter = new WikipediaAdapter({
        source: 'wikipedia',
        baseUrl: 'https://en.wikipedia.org/w/api.php',
      });

      const tvSearchResponse = {
        query: {
          search: [
            {
              pageid: 300,
              title: 'Test Show',
              snippet: 'Test Show is a <span class="searchmatch">television</span> series',
              wordcount: 1500,
            },
          ],
          searchinfo: { totalhits: 1 },
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(tvSearchResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await adapter.search('Test Show');
      const hints = result.candidates[0].classificationHints ?? [];
      const tvHint = hints.find((h) => h.category === 'TV_SERIES');
      expect(tvHint).toBeDefined();

      vi.restoreAllMocks();
    });

    it('returns empty hints when snippet has no classification terms', async () => {
      const adapter = new WikipediaAdapter({
        source: 'wikipedia',
        baseUrl: 'https://en.wikipedia.org/w/api.php',
      });

      const vagueSearchResponse = {
        query: {
          search: [
            {
              pageid: 400,
              title: 'Ambiguous Thing',
              snippet: 'Ambiguous Thing is a thing that does stuff',
              wordcount: 500,
            },
          ],
          searchinfo: { totalhits: 1 },
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(vagueSearchResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await adapter.search('Ambiguous Thing');
      const hints = result.candidates[0].classificationHints ?? [];
      expect(hints).toHaveLength(0);

      vi.restoreAllMocks();
    });
  });
});
