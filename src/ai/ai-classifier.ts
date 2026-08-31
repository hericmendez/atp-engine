import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type { Classifier } from '../classification/classifier.js';
import type { ClassificationResult } from '../classification/classification-result.js';
import type { DeterministicClassifier } from '../classification/deterministic-classifier.js';
import type { LLMProvider } from './provider.js';
import type { AIClassificationRequest } from './types.js';
import {
  VALID_CLASSIFICATION_CATEGORIES,
  CLASSIFICATION_LOW_CONFIDENCE_THRESHOLD,
  CLASSIFICATION_AMBIGUITY_THRESHOLD,
  AI_MIN_CONFIDENCE,
} from './constants.js';
import { CLASSIFICATION_PROMPT_VERSION } from './prompts/classification.js';
import { logAIOperation, startAITimer, type AIFallbackReason } from './observability.js';

export interface AIClassifierConfig {
  readonly enabled: boolean;
  readonly lowConfidenceThreshold?: number;
  readonly ambiguityThreshold?: number;
  readonly provider?: string;
  readonly model?: string;
}

export class AIClassifier implements Classifier {
  private readonly deterministic: DeterministicClassifier;
  private readonly provider: LLMProvider;
  private readonly config: AIClassifierConfig;

  constructor(
    deterministic: DeterministicClassifier,
    provider: LLMProvider,
    config: AIClassifierConfig,
  ) {
    this.deterministic = deterministic;
    this.provider = provider;
    this.config = {
      lowConfidenceThreshold: CLASSIFICATION_LOW_CONFIDENCE_THRESHOLD,
      ambiguityThreshold: CLASSIFICATION_AMBIGUITY_THRESHOLD,
      ...config,
    };
  }

  async classify(candidate: NormalizedCandidate): Promise<ClassificationResult> {
    const deterministicResult = await this.deterministic.classify(candidate);

    if (!this.config.enabled) {
      return deterministicResult;
    }

    const escalationReason = this.getEscalationReason(deterministicResult);
    if (!escalationReason) {
      return deterministicResult;
    }

    try {
      return await this.classifyWithAI(candidate, deterministicResult, escalationReason);
    } catch {
      logAIOperation({
        event: 'ai.operation',
        operation: 'classification',
        provider: this.config.provider ?? 'unknown',
        model: this.config.model ?? 'unknown',
        promptVersion: CLASSIFICATION_PROMPT_VERSION,
        durationMs: 0,
        success: false,
        fallback: true,
        fallbackReason: 'ai_failure',
        escalationReason,
      });
      return deterministicResult;
    }
  }

  private getEscalationReason(result: ClassificationResult): string | null {
    if (result.confidence < this.config.lowConfidenceThreshold!) {
      return 'low_confidence';
    }

    if (result.category === 'UNKNOWN') {
      return 'unknown_category';
    }

    const signals = result.signals;
    if (signals.length >= 2) {
      const sorted = [...signals].sort((a, b) => b.weight - a.weight);
      const gap = sorted[0].weight - sorted[1].weight;
      if (gap < this.config.ambiguityThreshold!) {
        return 'ambiguous_signals';
      }
    }

    return null;
  }

  private async classifyWithAI(
    candidate: NormalizedCandidate,
    deterministicResult: ClassificationResult,
    escalationReason: string,
  ): Promise<ClassificationResult> {
    const timer = startAITimer();
    const primaryTitle = candidate.titles.find((t) => t.type === 'primary') ?? candidate.titles[0];
    const title = primaryTitle?.value ?? 'Unknown';

    const request: AIClassificationRequest = {
      title,
      description: candidate.description,
      sourceHints: candidate.classificationHints.map((h) => h.category),
      genreHints: candidate.genres.map((g) => g.name),
      deterministicResult: {
        category: deterministicResult.category,
        confidence: deterministicResult.confidence,
        reason: deterministicResult.reason,
      },
    };

    const aiResponse = await this.provider.classify(request);
    const durationMs = timer();

    if (
      aiResponse.confidence < AI_MIN_CONFIDENCE ||
      !VALID_CLASSIFICATION_CATEGORIES.includes(
        aiResponse.category as (typeof VALID_CLASSIFICATION_CATEGORIES)[number],
      )
    ) {
      const fallbackReason: AIFallbackReason =
        aiResponse.confidence < AI_MIN_CONFIDENCE ? 'ai_low_confidence' : 'ai_invalid_response';

      logAIOperation({
        event: 'ai.operation',
        operation: 'classification',
        provider: this.config.provider ?? 'unknown',
        model: this.config.model ?? 'unknown',
        promptVersion: CLASSIFICATION_PROMPT_VERSION,
        durationMs,
        success: true,
        fallback: true,
        fallbackReason,
        confidence: aiResponse.confidence,
        escalationReason,
      });

      return deterministicResult;
    }

    logAIOperation({
      event: 'ai.operation',
      operation: 'classification',
      provider: this.config.provider ?? 'unknown',
      model: this.config.model ?? 'unknown',
      promptVersion: CLASSIFICATION_PROMPT_VERSION,
      durationMs,
      success: true,
      fallback: false,
      confidence: aiResponse.confidence,
      escalationReason,
    });

    return {
      category: aiResponse.category,
      confidence: aiResponse.confidence,
      signals: [
        ...deterministicResult.signals,
        {
          source: 'source-type' as const,
          category: aiResponse.category,
          weight: 1.0,
          confidence: aiResponse.confidence,
          evidence: `AI: ${aiResponse.reasoning}`,
        },
      ],
      reason: `AI-assisted: ${aiResponse.reasoning}`,
    };
  }
}
