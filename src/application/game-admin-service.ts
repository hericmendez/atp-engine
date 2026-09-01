import type { Game } from '../domain/game/game.js';
import type { GameRepository } from '../domain/game/game-repository.js';
import { createGame } from '../domain/game/game.js';
import { createGameId } from '../domain/shared/ids.js';
import { createGameTitle } from '../domain/shared/title.js';
import { createOrganization } from '../domain/shared/organization.js';
import { createGenre } from '../domain/shared/genre.js';
import { createExternalIdentifier } from '../domain/shared/external-identifier.js';
import type { ClassificationCategory } from '../domain/shared/classification-category.js';
import type { MetadataCompleteness } from '../domain/shared/metadata-completeness.js';
import { ValidationError, NotFoundError, ConflictError } from '../shared/errors/errors.js';
import { logger } from '../infrastructure/logger/logger.js';

export interface GameAdminServiceDependencies {
  gameRepository: GameRepository;
}

export interface CreateGameRequest {
  titles: Array<{ value: string; type?: string }>;
  developers?: Array<{ name: string }>;
  publishers?: Array<{ name: string }>;
  genres?: Array<{ name: string }>;
  externalIdentifiers?: Array<{ source: string; id: string }>;
  classification?: ClassificationCategory;
  completeness?: MetadataCompleteness;
}

export interface UpdateGameRequest {
  titles?: Array<{ value: string; type?: string }>;
  developers?: Array<{ name: string }>;
  publishers?: Array<{ name: string }>;
  genres?: Array<{ name: string }>;
  externalIdentifiers?: Array<{ source: string; id: string }>;
  classification?: ClassificationCategory;
  completeness?: MetadataCompleteness;
}

export class GameAdminService {
  private readonly gameRepository: GameRepository;

  constructor(deps: GameAdminServiceDependencies) {
    this.gameRepository = deps.gameRepository;
  }

  async createGame(input: CreateGameRequest): Promise<Game> {
    this.validateTitles(input.titles);

    for (const ext of input.externalIdentifiers ?? []) {
      const existing = await this.gameRepository.findByExternalIdentifier({
        source: ext.source,
        externalId: ext.id,
      });
      if (existing) {
        throw new ConflictError(
          `External identifier '${ext.source}:${ext.id}' is already assigned to game ${existing.id}`,
        );
      }
    }

    const gameId = createGameId(`admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

    const titles = input.titles.map((t) =>
      createGameTitle(
        t.value,
        t.type as 'primary' | 'alternate' | 'localized' | 'abbreviated' | undefined,
      ),
    );
    const developers = (input.developers ?? []).map((d) => createOrganization(d.name));
    const publishers = (input.publishers ?? []).map((p) => createOrganization(p.name));
    const genres = (input.genres ?? []).map((g) => createGenre(g.name));
    const externalIdentifiers = (input.externalIdentifiers ?? []).map((ei) =>
      createExternalIdentifier(ei.source, ei.id),
    );

    const game = createGame({
      id: gameId,
      titles,
      developers,
      publishers,
      genres,
      externalIdentifiers,
      classification: this.validateClassification(input.classification) as ClassificationCategory,
      completeness: this.validateCompleteness(input.completeness) as MetadataCompleteness,
    });

    await this.gameRepository.save(game);

    logger.info('Game created via admin API', {
      gameId: game.id,
      title: game.titles[0]?.value,
    });

    return game;
  }

  async updateGame(id: string, input: UpdateGameRequest): Promise<Game> {
    const gameId = createGameId(id);
    const existing = await this.gameRepository.findById(gameId);

    if (!existing) {
      throw new NotFoundError(`Game with ID ${id} not found`);
    }

    if (input.titles !== undefined) {
      this.validateTitles(input.titles);
    }

    if (input.externalIdentifiers !== undefined) {
      for (const ext of input.externalIdentifiers) {
        const conflicting = await this.gameRepository.findByExternalIdentifier({
          source: ext.source,
          externalId: ext.id,
        });
        if (conflicting && conflicting.id !== gameId) {
          throw new ConflictError(
            `External identifier '${ext.source}:${ext.id}' is already assigned to game ${conflicting.id}`,
          );
        }
      }
    }

    const titles =
      input.titles !== undefined
        ? input.titles.map((t) =>
            createGameTitle(
              t.value,
              t.type as 'primary' | 'alternate' | 'localized' | 'abbreviated' | undefined,
            ),
          )
        : existing.titles;

    const developers =
      input.developers !== undefined
        ? input.developers.map((d) => createOrganization(d.name))
        : existing.developers;

    const publishers =
      input.publishers !== undefined
        ? input.publishers.map((p) => createOrganization(p.name))
        : existing.publishers;

    const genres =
      input.genres !== undefined ? input.genres.map((g) => createGenre(g.name)) : existing.genres;

    const externalIdentifiers =
      input.externalIdentifiers !== undefined
        ? input.externalIdentifiers.map((ei) => createExternalIdentifier(ei.source, ei.id))
        : existing.externalIdentifiers;

    const classification =
      input.classification !== undefined
        ? (this.validateClassification(input.classification) as ClassificationCategory)
        : existing.classification;

    const completeness =
      input.completeness !== undefined
        ? (this.validateCompleteness(input.completeness) as MetadataCompleteness)
        : existing.completeness;

    const updated: Game = {
      ...existing,
      titles,
      developers,
      publishers,
      genres,
      externalIdentifiers,
      classification,
      completeness,
    };

    await this.gameRepository.update(updated);

    logger.info('Game updated via admin API', {
      gameId: updated.id,
      title: updated.titles[0]?.value,
    });

    return updated;
  }

  async deleteGame(id: string): Promise<void> {
    const gameId = createGameId(id);
    const existing = await this.gameRepository.findById(gameId);

    if (!existing) {
      throw new NotFoundError(`Game with ID ${id} not found`);
    }

    await this.gameRepository.deleteById(gameId);

    logger.info('Game deleted via admin API', {
      gameId: existing.id,
      title: existing.titles[0]?.value,
    });
  }

  private validateTitles(titles: Array<{ value: string; type?: string }>): void {
    if (!titles || titles.length === 0) {
      throw new ValidationError('At least one title is required');
    }
    for (const title of titles) {
      if (!title.value || title.value.trim().length === 0) {
        throw new ValidationError('Title value must not be empty');
      }
    }
  }

  private validateClassification(value?: string): string {
    if (value === undefined) return 'UNKNOWN';
    const valid = [
      'GAME',
      'DLC',
      'EXPANSION',
      'MOVIE',
      'TV_SHOW',
      'ANIME',
      'SOUNDTRACK',
      'BOOK',
      'HARDWARE',
      'PROMOTIONAL',
      'CHARACTER',
      'FRANCHISE',
      'PERSON',
      'EVENT',
      'UNKNOWN',
    ];
    if (!valid.includes(value)) {
      throw new ValidationError(`Invalid classification: ${value}`);
    }
    return value;
  }

  private validateCompleteness(value?: string): string {
    if (value === undefined) return 'FOUND_PARTIAL';
    const valid = ['NOT_FOUND', 'FOUND_PARTIAL', 'FOUND_SUFFICIENT', 'FOUND_COMPLETE'];
    if (!valid.includes(value)) {
      throw new ValidationError(`Invalid completeness: ${value}`);
    }
    return value;
  }
}
