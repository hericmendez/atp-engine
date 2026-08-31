import type { ClassificationCategory } from '../domain/shared/classification-category.js';
import type { IdentityOutcome } from '../domain/shared/identity-outcome.js';
import type { GameRelationshipType } from '../domain/shared/game-relationship-type.js';

// ─── Classification ────────────────────────────────────────────

export interface AIClassificationRequest {
  readonly title: string;
  readonly description: string | null;
  readonly sourceHints: readonly string[];
  readonly genreHints: readonly string[];
  readonly deterministicResult: {
    readonly category: ClassificationCategory;
    readonly confidence: number;
    readonly reason: string;
  };
}

export interface AIClassificationResponse {
  readonly category: ClassificationCategory;
  readonly confidence: number;
  readonly reasoning: string;
}

// ─── Identity Resolution ───────────────────────────────────────

export interface AIIdentityRequest {
  readonly candidateTitle: string;
  readonly candidateDevelopers: readonly string[];
  readonly candidatePlatforms: readonly string[];
  readonly existingTitle: string;
  readonly existingDevelopers: readonly string[];
  readonly existingPlatforms: readonly string[];
  readonly deterministicResult: {
    readonly outcome: IdentityOutcome;
    readonly confidence: number;
    readonly reason: string;
  };
}

export interface AIIdentityResponse {
  readonly outcome: IdentityOutcome;
  readonly relationship: GameRelationshipType | null;
  readonly confidence: number;
  readonly reasoning: string;
}

// ─── Enrichment Conflict ───────────────────────────────────────

export interface AIEnrichmentConflictRequest {
  readonly fieldType: string;
  readonly valueA: string;
  readonly sourceA: string;
  readonly valueB: string;
  readonly sourceB: string;
  readonly gameTitle: string;
}

export interface AIEnrichmentConflictResponse {
  readonly recommendedValue: string;
  readonly reasoning: string;
  readonly confidence: number;
}
