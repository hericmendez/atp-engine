import type { Game } from '../domain/game/game.js';
import type { EnrichmentConflict } from '../enrichment/enrichment-types.js';
import type { LLMProvider } from './provider.js';
import type { AIEnrichmentConflictRequest } from './types.js';
import { ENRICHMENT_MIN_CONFIDENCE } from './constants.js';
import { ENRICHMENT_PROMPT_VERSION } from './prompts/enrichment.js';
import { logAIOperation, startAITimer, type AIFallbackReason } from './observability.js';

export interface AIEnrichmentConfig {
  readonly enabled: boolean;
  readonly minConfidence?: number;
  readonly provider?: string;
  readonly model?: string;
}

export interface AIConflictResolution {
  readonly conflict: EnrichmentConflict;
  readonly recommendedValue: string;
  readonly reasoning: string;
  readonly confidence: number;
}

export class AIEnrichmentAssist {
  private readonly provider: LLMProvider;
  private readonly config: AIEnrichmentConfig;

  constructor(provider: LLMProvider, config: AIEnrichmentConfig) {
    this.provider = provider;
    this.config = {
      minConfidence: ENRICHMENT_MIN_CONFIDENCE,
      ...config,
    };
  }

  async resolveConflicts(
    conflicts: readonly EnrichmentConflict[],
    game: Game,
  ): Promise<readonly AIConflictResolution[]> {
    if (!this.config.enabled || conflicts.length === 0) {
      return [];
    }

    const primaryTitle =
      game.titles.find((t) => t.type === 'primary')?.value ?? game.titles[0]?.value ?? 'Unknown';

    const results: AIConflictResolution[] = [];

    for (const conflict of conflicts) {
      const timer = startAITimer();
      try {
        const request: AIEnrichmentConflictRequest = {
          fieldType: conflict.fieldType,
          valueA: conflict.valueA,
          sourceA: conflict.sourceA,
          valueB: conflict.valueB,
          sourceB: conflict.sourceB,
          gameTitle: primaryTitle,
        };

        const response = await this.provider.resolveConflict(request);
        const durationMs = timer();

        if (response.confidence >= this.config.minConfidence!) {
          logAIOperation({
            event: 'ai.operation',
            operation: 'enrichment_conflict',
            provider: this.config.provider ?? 'unknown',
            model: this.config.model ?? 'unknown',
            promptVersion: ENRICHMENT_PROMPT_VERSION,
            durationMs,
            success: true,
            fallback: false,
            confidence: response.confidence,
          });

          results.push({
            conflict,
            recommendedValue: response.recommendedValue,
            reasoning: response.reasoning,
            confidence: response.confidence,
          });
        } else {
          logAIOperation({
            event: 'ai.operation',
            operation: 'enrichment_conflict',
            provider: this.config.provider ?? 'unknown',
            model: this.config.model ?? 'unknown',
            promptVersion: ENRICHMENT_PROMPT_VERSION,
            durationMs,
            success: true,
            fallback: true,
            fallbackReason: 'ai_low_confidence' as AIFallbackReason,
            confidence: response.confidence,
          });
        }
      } catch {
        const durationMs = timer();
        logAIOperation({
          event: 'ai.operation',
          operation: 'enrichment_conflict',
          provider: this.config.provider ?? 'unknown',
          model: this.config.model ?? 'unknown',
          promptVersion: ENRICHMENT_PROMPT_VERSION,
          durationMs,
          success: false,
          fallback: true,
          fallbackReason: 'ai_failure',
        });
      }
    }

    return results;
  }
}
