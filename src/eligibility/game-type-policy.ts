/**
 * Deterministic catalog-eligibility policy over provider-declared
 * game_type / game_status (ratified: docs/reports/catalog-eligibility-policy.md).
 *
 * Pure function: no I/O, no repository access, no Game creation, no
 * identity mutation. It answers only "what kind of catalog decision does
 * this provider metadata warrant". Port-parent resolution, relationship
 * creation and reclassification handling are later phases that consume
 * this decision.
 *
 * Vocabulary note: type/status strings originate from providers (today
 * IGDB names, see sources/igdb/igdb-game-type.ts). This module matches
 * them as opaque values and never imports provider modules, keeping
 * eligibility provider-agnostic.
 *
 * Data-preservation note: an absent gameStatus is NEVER rewritten to
 * "released" (or anything else) here or downstream. The candidate keeps
 * `gameStatus: null`; only this decision changes. Release evidence
 * (domain ReleaseDate, Date, or ISO string) corroborates past release
 * for admissible types — it does not fabricate a status.
 */

import type { ReleaseDate } from '../domain/shared/release-date.js';

export const CatalogPolicyDecision = {
  /** Admissible as a canonical game (subject to the unified gate). */
  CANONICAL: 'CANONICAL',
  /** Must resolve to an existing canonical game, never a new one. */
  PORT: 'PORT',
  /** Excluded; observable via quarantine/sync accounting. */
  QUARANTINE: 'QUARANTINE',
  /** Needs curatorial/human decision; never silently canonical. */
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
} as const;

export type CatalogPolicyDecision =
  (typeof CatalogPolicyDecision)[keyof typeof CatalogPolicyDecision];

export interface CatalogPolicyInput {
  readonly gameType?: string | null;
  readonly gameStatus?: string | null;
  /**
   * Provider-agnostic release evidence. Accepts the domain ReleaseDate,
   * a Date, or a parseable string. Missing, future, or unparseable
   * values count as "no evidence" — never as released.
   */
  readonly releaseDate?: ReleaseDate | Date | string | null;
}

export interface CatalogPolicyResult {
  readonly decision: CatalogPolicyDecision;
  readonly reason: string;
  readonly gameType: string | null;
  readonly gameStatus: string | null;
}

// ─── Type sets (ratified P2) ─────────────────────────────────────

export const CANONICAL_TYPES: readonly string[] = [
  'main_game',
  'standalone_expansion',
  'remake',
  'remaster',
  'expanded_game',
];

const QUARANTINE_TYPES: readonly string[] = [
  'dlc_addon',
  'bundle',
  'mod',
  'episode',
  'season',
  'fork',
  'pack',
  'update',
];

// ─── Status sets (ratified released + announced/upcoming) ────────
// Only explicitly admitted statuses pass; `delisted` stays eligible
// (availability is metadata, not identity). Everything else — including
// pre-release states the policy does not name and unknown values —
// requires review rather than silent admission or silent rejection.

const ADMITTED_STATUSES: readonly string[] = [
  'released',
  'announced',
  'upcoming',
  'delisted',
];

const QUARANTINE_STATUSES: readonly string[] = [
  'cancelled',
  'rumored',
  'dead',
];

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * True only when the evidence positively shows a past release.
 * Conservative by construction: for partial precision the whole period
 * must lie in the past (a current year/month/day is NOT past), and
 * missing, future, or unparseable values return false.
 */
function isPastRelease(value: ReleaseDate | Date | string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
      return false;
    }
    return parsed < Date.now();
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return !Number.isNaN(time) && time < Date.now();
  }

  const now = new Date();
  switch (value.precision) {
    case 'day':
      if (value.month === null || value.day === null) {
        return false;
      }
      return (
        Date.UTC(value.year, value.month - 1, value.day) <
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
      );
    case 'month':
      if (value.month === null) {
        return false;
      }
      return (
        value.year < now.getUTCFullYear() ||
        (value.year === now.getUTCFullYear() && value.month < now.getUTCMonth() + 1)
      );
    case 'year':
      return value.year < now.getUTCFullYear();
    default:
      return false;
  }
}

/**
 * Evaluate provider type/status into a catalog decision.
 *
 * Order: dead statuses quarantine first (no resolution work is wasted
 * on them); then the type decision; an unknown status downgrades an
 * otherwise admissible type decision to review (never silent canonical).
 * Absent status over an admissible type is canonical ONLY with positive
 * past-release evidence — the status itself is never rewritten.
 */
export function evaluateCatalogPolicy(
  input: CatalogPolicyInput,
): CatalogPolicyResult {
  const gameType = normalize(input.gameType);
  const gameStatus = normalize(input.gameStatus);

  if (gameStatus !== null && QUARANTINE_STATUSES.includes(gameStatus)) {
    return {
      decision: CatalogPolicyDecision.QUARANTINE,
      reason: `gameStatus "${gameStatus}" is excluded from the canonical catalog`,
      gameType,
      gameStatus,
    };
  }

  if (gameType === null) {
    return {
      decision: CatalogPolicyDecision.REVIEW_REQUIRED,
      reason: 'missing gameType requires curatorial review',
      gameType,
      gameStatus,
    };
  }

  if (gameType === 'port') {
    if (gameStatus !== null && !ADMITTED_STATUSES.includes(gameStatus)) {
      return {
        decision: CatalogPolicyDecision.REVIEW_REQUIRED,
        reason: `port with non-admitted gameStatus "${gameStatus}" requires curatorial review`,
        gameType,
        gameStatus,
      };
    }
    return {
      decision: CatalogPolicyDecision.PORT,
      reason: 'port must resolve to an existing canonical game, never a new one',
      gameType,
      gameStatus,
    };
  }

  if (gameType === 'expansion') {
    // Ratified: standalone-playability cannot be inferred from metadata
    // available here (no title/size/platform/year heuristics allowed).
    return {
      decision: CatalogPolicyDecision.REVIEW_REQUIRED,
      reason: 'expansion requires curatorial standalone-playability review',
      gameType,
      gameStatus,
    };
  }

  if (QUARANTINE_TYPES.includes(gameType)) {
    return {
      decision: CatalogPolicyDecision.QUARANTINE,
      reason: `gameType "${gameType}" is excluded from the canonical catalog`,
      gameType,
      gameStatus,
    };
  }

  if (CANONICAL_TYPES.includes(gameType)) {
    if (gameStatus !== null && !ADMITTED_STATUSES.includes(gameStatus)) {
      return {
        decision: CatalogPolicyDecision.REVIEW_REQUIRED,
        reason: `gameType "${gameType}" with non-admitted gameStatus "${gameStatus}" requires curatorial review`,
        gameType,
        gameStatus,
      };
    }
    if (gameStatus === null) {
      // Absent status is "no special state marked", not "released".
      // Past release evidence corroborates a normal released game;
      // without it (or with future evidence) the record needs review.
      // gameStatus itself stays null — only the decision changes.
      if (isPastRelease(input.releaseDate)) {
        return {
          decision: CatalogPolicyDecision.CANONICAL,
          reason: `gameType "${gameType}" with absent gameStatus but past release evidence is catalog-admissible`,
          gameType,
          gameStatus,
        };
      }
      return {
        decision: CatalogPolicyDecision.REVIEW_REQUIRED,
        reason: `gameType "${gameType}" with unknown gameStatus requires curatorial review`,
        gameType,
        gameStatus,
      };
    }
    return {
      decision: CatalogPolicyDecision.CANONICAL,
      reason: `gameType "${gameType}" with gameStatus "${gameStatus}" is catalog-admissible`,
      gameType,
      gameStatus,
    };
  }

  return {
    decision: CatalogPolicyDecision.REVIEW_REQUIRED,
    reason: `unknown gameType "${gameType}" requires curatorial review`,
    gameType,
    gameStatus,
  };
}
