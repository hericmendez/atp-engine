import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type { Game } from '../domain/game/game.js';
import type { IdentityResolver } from '../identity/identity-resolver.js';
import type { IdentityResolutionResult } from '../identity/identity-resolution-result.js';
import type { DeterministicIdentityResolver } from '../identity/deterministic-identity-resolver.js';
import type { LLMProvider } from './provider.js';
import type { AIIdentityRequest } from './types.js';
import {
  VALID_IDENTITY_OUTCOMES,
  IDENTITY_LOW_CONFIDENCE_THRESHOLD,
  AI_MIN_CONFIDENCE,
} from './constants.js';
import { IDENTITY_PROMPT_VERSION } from './prompts/identity.js';
import { logAIOperation, startAITimer, type AIFallbackReason } from './observability.js';

export interface AIIdentityResolverConfig {
  readonly enabled: boolean;
  readonly lowConfidenceThreshold?: number;
  readonly provider?: string;
  readonly model?: string;
}

export class AIIdentityResolver implements IdentityResolver {
  private readonly deterministic: DeterministicIdentityResolver;
  private readonly provider: LLMProvider;
  private readonly config: AIIdentityResolverConfig;

  constructor(
    deterministic: DeterministicIdentityResolver,
    provider: LLMProvider,
    config: AIIdentityResolverConfig,
  ) {
    this.deterministic = deterministic;
    this.provider = provider;
    this.config = {
      lowConfidenceThreshold: IDENTITY_LOW_CONFIDENCE_THRESHOLD,
      ...config,
    };
  }

  async resolve(
    candidate: NormalizedCandidate,
    existingGame: Game | null,
  ): Promise<IdentityResolutionResult> {
    const deterministicResult = await this.deterministic.resolve(candidate, existingGame);

    if (!this.config.enabled) {
      return deterministicResult;
    }

    const escalationReason = this.getEscalationReason(deterministicResult);
    if (!escalationReason) {
      return deterministicResult;
    }

    try {
      return await this.resolveWithAI(
        candidate,
        existingGame,
        deterministicResult,
        escalationReason,
      );
    } catch {
      logAIOperation({
        event: 'ai.operation',
        operation: 'identity_resolution',
        provider: this.config.provider ?? 'unknown',
        model: this.config.model ?? 'unknown',
        promptVersion: IDENTITY_PROMPT_VERSION,
        durationMs: 0,
        success: false,
        fallback: true,
        fallbackReason: 'ai_failure',
        escalationReason,
      });
      return deterministicResult;
    }
  }

  private getEscalationReason(result: IdentityResolutionResult): string | null {
    if (result.outcome === 'UNRESOLVED') {
      return 'unresolved';
    }

    if (result.confidence < this.config.lowConfidenceThreshold!) {
      return 'low_confidence';
    }

    return null;
  }

  private async resolveWithAI(
    candidate: NormalizedCandidate,
    existingGame: Game | null,
    deterministicResult: IdentityResolutionResult,
    escalationReason: string,
  ): Promise<IdentityResolutionResult> {
    const timer = startAITimer();
    const primaryTitle = candidate.titles.find((t) => t.type === 'primary') ?? candidate.titles[0];
    const candidateTitle = primaryTitle?.value ?? 'Unknown';

    const existingTitle =
      existingGame?.titles.find((t) => t.type === 'primary')?.value ??
      existingGame?.titles[0]?.value ??
      'Unknown';

    const request: AIIdentityRequest = {
      candidateTitle,
      candidateDevelopers: candidate.developers.map((d) => d.name),
      candidatePlatforms: candidate.releases.map((r) => r.platform.name),
      existingTitle,
      existingDevelopers: existingGame?.developers.map((d) => d.name) ?? [],
      existingPlatforms: existingGame?.releases.map((r) => r.platform.name) ?? [],
      deterministicResult: {
        outcome: deterministicResult.outcome,
        confidence: deterministicResult.confidence,
        reason: deterministicResult.reason,
      },
    };

    const aiResponse = await this.provider.resolveIdentity(request);
    const durationMs = timer();

    if (
      aiResponse.confidence < AI_MIN_CONFIDENCE ||
      !VALID_IDENTITY_OUTCOMES.includes(
        aiResponse.outcome as (typeof VALID_IDENTITY_OUTCOMES)[number],
      )
    ) {
      const fallbackReason: AIFallbackReason =
        aiResponse.confidence < AI_MIN_CONFIDENCE ? 'ai_low_confidence' : 'ai_invalid_response';

      logAIOperation({
        event: 'ai.operation',
        operation: 'identity_resolution',
        provider: this.config.provider ?? 'unknown',
        model: this.config.model ?? 'unknown',
        promptVersion: IDENTITY_PROMPT_VERSION,
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
      operation: 'identity_resolution',
      provider: this.config.provider ?? 'unknown',
      model: this.config.model ?? 'unknown',
      promptVersion: IDENTITY_PROMPT_VERSION,
      durationMs,
      success: true,
      fallback: false,
      confidence: aiResponse.confidence,
      escalationReason,
    });

    return {
      outcome: aiResponse.outcome,
      relationship: aiResponse.relationship,
      confidence: aiResponse.confidence,
      signals: [
        ...deterministicResult.signals,
        {
          source: 'description-similar' as const,
          weight: 1.0,
          confidence: aiResponse.confidence,
          evidence: `AI: ${aiResponse.reasoning}`,
        },
      ],
      reason: `AI-assisted: ${aiResponse.reasoning}`,
      method: 'AI' as const,
    };
  }
}
