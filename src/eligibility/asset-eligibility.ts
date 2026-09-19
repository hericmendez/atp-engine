import type { Game } from '../domain/game/game.js';
import type { CoverCandidate } from '../domain/cover/cover-candidate.js';
import { CoverType, CoverSearchType } from '../domain/cover/cover-candidate.js';
import { logger } from '../infrastructure/logger/logger.js';

// ─── Decision ────────────────────────────────────────────────

export interface AssetEligibilityDecision {
  readonly eligible: boolean;
  readonly confidence: number;
  readonly reason: string;
  readonly blockingReasons: readonly string[];
  readonly warnings: readonly string[];
}

// ─── Allowed types per search type ───────────────────────────

const COVER_ALLOWED_TYPES: readonly CoverType[] = [
  CoverType.FRONT_COVER,
  CoverType.BOX_ART,
  CoverType.POSTER,
  CoverType.KEY_ART,
  CoverType.UNKNOWN,
];

const LOGO_ALLOWED_TYPES: readonly CoverType[] = [CoverType.LOGO];

// ─── Policy ──────────────────────────────────────────────────

export function assetEligibility(
  candidate: CoverCandidate,
  game: Game | null,
  searchType: CoverSearchType,
): AssetEligibilityDecision {
  const warnings: string[] = [];

  // ── Check 1: missing source ─────────────────────────────────
  if (!candidate.source || candidate.source.trim().length === 0) {
    return reject('Asset has no source', ['missing_source']);
  }

  // ── Check 2: missing sourceId ───────────────────────────────
  if (!candidate.sourceId || candidate.sourceId.trim().length === 0) {
    return reject('Asset has no sourceId', ['missing_source_id']);
  }

  // ── Check 3: type appropriateness ───────────────────────────
  const typeDecision = checkTypeAppropriateness(candidate.type, searchType);
  if (!typeDecision.eligible) {
    return typeDecision;
  }

  // ── Check 4: entity association ─────────────────────────────
  if (game !== null) {
    return checkEntityAssociation(candidate, game, warnings);
  }

  // ── Game is null: query-based search ────────────────────────
  // Without a canonical game, we cannot validate entity association.
  // Accept with warning — the caller must understand this limitation.
  warnings.push('No canonical game provided — entity association cannot be validated');

  return {
    eligible: true,
    confidence: 0.5,
    reason: 'Query-based search without canonical game — accepted with limited validation',
    blockingReasons: [],
    warnings,
  };
}

// ─── Type Check ──────────────────────────────────────────────

function checkTypeAppropriateness(
  assetType: CoverType,
  searchType: CoverSearchType,
): AssetEligibilityDecision {
  if (searchType === CoverSearchType.ALL) {
    return {
      eligible: true,
      confidence: 1.0,
      reason: 'ALL search type accepts all asset types',
      blockingReasons: [],
      warnings: [],
    };
  }

  const allowedTypes =
    searchType === CoverSearchType.LOGO ? LOGO_ALLOWED_TYPES : COVER_ALLOWED_TYPES;

  if (allowedTypes.includes(assetType)) {
    return {
      eligible: true,
      confidence: 1.0,
      reason: `Asset type "${assetType}" is appropriate for ${searchType} search`,
      blockingReasons: [],
      warnings: [],
    };
  }

  return reject(`Asset type "${assetType}" is not appropriate for ${searchType} search`, [
    'type_mismatch',
  ]);
}

// ─── Entity Association ──────────────────────────────────────

function checkEntityAssociation(
  candidate: CoverCandidate,
  game: Game,
  warnings: string[],
): AssetEligibilityDecision {
  // ── Strongest signal: source entity ID matches game external ID ──
  const matchingExtId = game.externalIdentifiers.find(
    (e) => e.source === candidate.source && e.id === candidate.sourceId,
  );

  if (matchingExtId) {
    return {
      eligible: true,
      confidence: 1.0,
      reason: `Source entity "${candidate.source}:${candidate.sourceId}" matches game external identifier`,
      blockingReasons: [],
      warnings,
    };
  }

  // ── Game has no external ID for this source ────────────────────
  const gameHasThisSource = game.externalIdentifiers.some((e) => e.source === candidate.source);

  if (!gameHasThisSource) {
    // The game has no external identifier from this source at all.
    // We cannot validate or invalidate the association.
    // Accept conservatively — the asset may be valid but unverifiable.
    warnings.push(
      `Game has no external identifier for source "${candidate.source}" — association unverifiable`,
    );
    return {
      eligible: true,
      confidence: 0.4,
      reason: `Game has no external identifier for source "${candidate.source}" — cannot validate association`,
      blockingReasons: [],
      warnings,
    };
  }

  // ── Game has a different external ID for this source ───────────
  // This is the key case: the asset belongs to a different entity
  // from the same source. E.g., asset from "Zelda_(name)" but game
  // is "The_Legend_of_Zelda".
  return reject(
    `Source entity "${candidate.source}:${candidate.sourceId}" does not match game external identifier for this source`,
    ['entity_mismatch'],
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function reject(reason: string, blockingReasons: string[]): AssetEligibilityDecision {
  return {
    eligible: false,
    confidence: 1.0,
    reason,
    blockingReasons,
    warnings: [],
  };
}

// ─── Logger integration ──────────────────────────────────────

export function logAssetEligibilityDecision(
  candidate: { source: string; sourceId: string; url: string },
  decision: AssetEligibilityDecision,
): void {
  const data = {
    source: candidate.source,
    sourceId: candidate.sourceId,
    url: candidate.url,
    eligible: decision.eligible,
    confidence: decision.confidence,
    reason: decision.reason,
    blockingReasons: decision.blockingReasons,
    warnings: decision.warnings,
  };

  if (decision.eligible) {
    logger.info('asset_eligibility.accepted', data);
  } else {
    logger.info('asset_eligibility.rejected', data);
  }
}
