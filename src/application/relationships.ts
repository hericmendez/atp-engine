import type { Game } from '../domain/game/game.js';
import type { GameId } from '../domain/shared/ids.js';
import {
  createGameRelationship,
} from '../domain/game/game-relationship.js';
import {
  gameAddRelationship,
  gameHasRelationship,
} from '../domain/game/game.js';
import { GameRelationshipType } from '../domain/shared/game-relationship-type.js';
import type { DiscoveryGroupResult } from '../discovery/discovery-types.js';
import type { DiscoverySourceObservation } from '../discovery/discovery-types.js';

/**
 * Deterministic original-game edge support for remakes/remasters.
 *
 * A remake/remaster is its own canonical Game; the edge only records the
 * derivation (remake ──REMAKE──> original). Target resolution uses
 * provider references only (parent_game precedence, version_parent
 * one-hop fallback — mirroring port precedence). Title matching, fuzzy
 * matching, similarity scores, and guesses are never used.
 */

export type OriginalEdgeKind = 'REMAKE' | 'REMASTER';

export interface OriginalReference {
  readonly field: 'parent_game' | 'version_parent';
  readonly externalId: string;
}

export interface OriginalEdgeRequest {
  readonly observation: DiscoverySourceObservation;
  readonly kind: OriginalEdgeKind;
  readonly ref: OriginalReference;
}

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function originalEdgeKind(gameType: string | null | undefined): OriginalEdgeKind | null {
  const normalized = normalize(gameType);
  if (normalized === 'remake') {
    return 'REMAKE';
  }
  if (normalized === 'remaster') {
    return 'REMASTER';
  }
  return null;
}

function selectReference(candidate: {
  parentGameId: string | null | undefined;
  versionParentId: string | null | undefined;
}): OriginalReference | null {
  const parentGameId = normalize(candidate.parentGameId);
  if (parentGameId !== null) {
    return { field: 'parent_game', externalId: parentGameId };
  }
  const versionParentId = normalize(candidate.versionParentId);
  if (versionParentId !== null) {
    return { field: 'version_parent', externalId: versionParentId };
  }
  return null;
}

/**
 * First observation (group order) declaring a remake/remaster with a
 * resolvable original reference. Returns null when the group carries no
 * such declaration — the caller must not invent a target.
 */
export function findOriginalEdgeRequest(
  group: DiscoveryGroupResult,
): OriginalEdgeRequest | null {
  for (const observation of group.observations) {
    const kind = originalEdgeKind(observation.candidate.gameType);
    if (kind === null) {
      continue;
    }
    const ref = selectReference(observation.candidate);
    if (ref === null) {
      continue;
    }
    return { observation, kind, ref };
  }
  return null;
}

/**
 * Attach the original edge idempotently. An existing identical edge is
 * recognized (no duplicate, no throw); otherwise the edge is appended
 * through the existing domain primitive. Callers must skip self-edges
 * before invoking (createGameRelationship rejects them).
 */
export function withOriginalEdge(
  game: Game,
  targetId: GameId,
  kind: OriginalEdgeKind,
): { game: Game; added: boolean } {
  const type =
    kind === 'REMAKE' ? GameRelationshipType.REMAKE : GameRelationshipType.REMASTER;

  if (gameHasRelationship(game, targetId, type)) {
    return { game, added: false };
  }

  return {
    game: gameAddRelationship(
      game,
      createGameRelationship({ sourceGameId: game.id, targetGameId: targetId, type }),
    ),
    added: true,
  };
}
