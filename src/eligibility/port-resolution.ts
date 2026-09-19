/**
 * Deterministic port-parent reference selection.
 *
 * Pure function: no I/O, no repository access, no Game creation. Given a
 * candidate's provider-declared type and parent references, it answers
 * only "which reference identifies the canonical parent, if any".
 * Actually resolving that reference against Mongo is the caller's job.
 *
 * Rules (ratified: parent_game takes precedence; version_parent is a
 * one-hop fallback only; chains are never followed here — a single
 * reference is returned and the caller resolves exactly one lookup):
 *
 * - gameType !== 'port' → not-port (nothing to resolve)
 * - parentGameId present → parent-reference via parent_game
 * - else versionParentId present → parent-reference via version_parent
 * - else → unresolved (MISSING_PARENT_REFERENCE)
 *
 * Title matching, fuzzy matching, and similarity scores are never used.
 */

export type PortParentReference =
  | { readonly kind: 'not-port' }
  | {
      readonly kind: 'parent-reference';
      readonly field: 'parent_game' | 'version_parent';
      readonly externalId: string;
    }
  | { readonly kind: 'unresolved'; readonly reason: 'MISSING_PARENT_REFERENCE' };

export interface PortParentInput {
  readonly gameType: string | null | undefined;
  readonly parentGameId: string | null | undefined;
  readonly versionParentId: string | null | undefined;
}

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolvePortParent(input: PortParentInput): PortParentReference {
  if (normalize(input.gameType) !== 'port') {
    return { kind: 'not-port' };
  }

  const parentGameId = normalize(input.parentGameId);
  if (parentGameId !== null) {
    return { kind: 'parent-reference', field: 'parent_game', externalId: parentGameId };
  }

  const versionParentId = normalize(input.versionParentId);
  if (versionParentId !== null) {
    return { kind: 'parent-reference', field: 'version_parent', externalId: versionParentId };
  }

  return { kind: 'unresolved', reason: 'MISSING_PARENT_REFERENCE' };
}
