import type { GameId } from '../shared/ids.js';
import type { GameTitle } from '../shared/title.js';
import type { Organization } from '../shared/organization.js';
import type { Genre } from '../shared/genre.js';
import type { ExternalIdentifier } from '../shared/external-identifier.js';
import type { SourceEvidence } from '../shared/source-evidence.js';
import type { MetadataCompleteness } from '../shared/metadata-completeness.js';
import type { ClassificationCategory } from '../shared/classification-category.js';
import type { Release } from './release.js';
import type { GameRelationship } from './game-relationship.js';
import type { GameRelationshipType } from '../shared/game-relationship-type.js';
import type { CoverType } from '../cover/cover-candidate.js';

export interface GameCover {
  readonly url: string;
  readonly source: string;
  readonly sourceId: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly type: CoverType;
}

export interface Game {
  readonly id: GameId;
  readonly titles: readonly GameTitle[];
  readonly releases: readonly Release[];
  readonly developers: readonly Organization[];
  readonly publishers: readonly Organization[];
  readonly genres: readonly Genre[];
  readonly externalIdentifiers: readonly ExternalIdentifier[];
  readonly relationships: readonly GameRelationship[];
  readonly evidence: readonly SourceEvidence[];
  readonly classification: ClassificationCategory;
  readonly completeness: MetadataCompleteness;
  readonly cover: GameCover | null;
  readonly lastEnrichedAt: Date | null;
}

export interface CreateGameInput {
  id: GameId;
  titles: readonly GameTitle[];
  developers?: readonly Organization[];
  publishers?: readonly Organization[];
  genres?: readonly Genre[];
  externalIdentifiers?: readonly ExternalIdentifier[];
  classification?: ClassificationCategory;
  completeness?: MetadataCompleteness;
}

export function createGame(input: CreateGameInput): Game {
  if (input.titles.length === 0) {
    throw new Error('A game must have at least one title');
  }

  return {
    id: input.id,
    titles: [...input.titles],
    releases: [],
    developers: input.developers ? [...input.developers] : [],
    publishers: input.publishers ? [...input.publishers] : [],
    genres: input.genres ? [...input.genres] : [],
    externalIdentifiers: input.externalIdentifiers ? [...input.externalIdentifiers] : [],
    relationships: [],
    evidence: [],
    classification: input.classification ?? 'UNKNOWN',
    completeness: input.completeness ?? 'FOUND_PARTIAL',
    cover: null,
    lastEnrichedAt: null,
  };
}

export function gameAddRelease(game: Game, release: Release): Game {
  if (release.gameId !== game.id) {
    throw new Error('Release does not belong to this game');
  }

  const exists = game.releases.some((r) => r.id === release.id);
  if (exists) {
    throw new Error(`Release ${release.id} already exists on this game`);
  }

  return {
    ...game,
    releases: [...game.releases, release],
  };
}

export function gameAddRelationship(game: Game, relationship: GameRelationship): Game {
  if (relationship.sourceGameId !== game.id) {
    throw new Error('Relationship does not originate from this game');
  }

  if (relationship.sourceGameId === relationship.targetGameId) {
    throw new Error('A game cannot have a relationship with itself');
  }

  const exists = game.relationships.some(
    (r) =>
      r.sourceGameId === relationship.sourceGameId &&
      r.targetGameId === relationship.targetGameId &&
      r.type === relationship.type,
  );
  if (exists) {
    throw new Error('Relationship already exists');
  }

  return {
    ...game,
    relationships: [...game.relationships, relationship],
  };
}

export function gameAddTitle(game: Game, title: GameTitle): Game {
  const exists = game.titles.some((t) => t.value === title.value && t.type === title.type);
  if (exists) {
    throw new Error('Title already exists on this game');
  }

  return {
    ...game,
    titles: [...game.titles, title],
  };
}

export function gameAddEvidence(game: Game, evidence: SourceEvidence): Game {
  return {
    ...game,
    evidence: [...game.evidence, evidence],
  };
}

export function gameAddExternalIdentifier(game: Game, identifier: ExternalIdentifier): Game {
  const exists = game.externalIdentifiers.some(
    (ei) => ei.source === identifier.source && ei.id === identifier.id,
  );
  if (exists) {
    return game;
  }

  return {
    ...game,
    externalIdentifiers: [...game.externalIdentifiers, identifier],
  };
}

export function gameWithClassification(game: Game, classification: ClassificationCategory): Game {
  return {
    ...game,
    classification,
  };
}

export function gameWithCompleteness(game: Game, completeness: MetadataCompleteness): Game {
  return {
    ...game,
    completeness,
  };
}

export function gameFindRelease(game: Game, releaseId: string): Release | undefined {
  return game.releases.find((r) => r.id === releaseId);
}

export function gameHasRelationship(
  game: Game,
  targetGameId: GameId,
  type?: GameRelationshipType,
): boolean {
  return game.relationships.some(
    (r) => r.targetGameId === targetGameId && (type === undefined || r.type === type),
  );
}

export function gamePrimaryTitle(game: Game): GameTitle | undefined {
  return game.titles.find((t) => t.type === 'primary') ?? game.titles[0];
}

export function gameWithCover(game: Game, cover: GameCover | null): Game {
  return {
    ...game,
    cover,
  };
}

export function gameWithLastEnrichedAt(game: Game, lastEnrichedAt: Date): Game {
  return {
    ...game,
    lastEnrichedAt,
  };
}
