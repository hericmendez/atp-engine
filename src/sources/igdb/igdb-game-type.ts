/**
 * IGDB game_type / game_status vocabularies.
 *
 * Numeric IDs follow the IGDB API (game_type table; game_status table:
 * 0 released, 2 alpha, 3 beta, 4 early_access, 5 offline, 6 cancelled,
 * 7 rumored, 8 delisted). Names are the canonical IGDB labels. Unknown
 * IDs are never invented here — callers must treat unmapped values as
 * absent and preserve the raw numeric ID in metadata for traceability.
 */

export const IGDB_GAME_TYPE_NAMES: Record<number, string> = {
  0: 'main_game',
  1: 'dlc_addon',
  2: 'expansion',
  3: 'bundle',
  4: 'standalone_expansion',
  5: 'mod',
  6: 'episode',
  7: 'season',
  8: 'remake',
  9: 'remaster',
  10: 'expanded_game',
  11: 'port',
  12: 'fork',
  13: 'pack',
  14: 'update',
};

export const IGDB_GAME_STATUS_NAMES: Record<number, string> = {
  0: 'released',
  2: 'alpha',
  3: 'beta',
  4: 'early_access',
  5: 'offline',
  6: 'cancelled',
  7: 'rumored',
  8: 'delisted',
};

export function igdbGameTypeName(id: number | null | undefined): string | undefined {
  if (id === null || id === undefined) {
    return undefined;
  }
  return IGDB_GAME_TYPE_NAMES[id];
}

/**
 * Numeric game_type IDs whose names belong to the catalog policy's
 * CANONICAL set (see eligibility/game-type-policy.ts): main_game (0),
 * standalone_expansion (4), remake (8), remaster (9), expanded_game
 * (10). Used by IgdbAdapter.search() so text discovery sees every
 * canonically admissible type — the downstream policy gate (not the
 * query) remains the admission authority. Covered by a parity test
 * against the policy's CANONICAL_TYPES.
 */
export const IGDB_CANONICAL_GAME_TYPE_IDS: readonly number[] = [0, 4, 8, 9, 10];

export function igdbGameStatusName(id: number | null | undefined): string | undefined {
  if (id === null || id === undefined) {
    return undefined;
  }
  return IGDB_GAME_STATUS_NAMES[id];
}
