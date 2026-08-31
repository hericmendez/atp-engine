import type { LLMProvider } from './provider.js';
import type {
  AIClassificationRequest,
  AIClassificationResponse,
  AIIdentityRequest,
  AIIdentityResponse,
  AIEnrichmentConflictRequest,
  AIEnrichmentConflictResponse,
} from './types.js';
import {
  VALID_CLASSIFICATION_CATEGORIES,
  VALID_IDENTITY_OUTCOMES,
  VALID_RELATIONSHIP_TYPES,
} from './constants.js';
import {
  CLASSIFICATION_SYSTEM_PROMPT,
  CLASSIFICATION_PROMPT_VERSION,
} from './prompts/classification.js';
import { IDENTITY_SYSTEM_PROMPT, IDENTITY_PROMPT_VERSION } from './prompts/identity.js';
import { ENRICHMENT_SYSTEM_PROMPT, ENRICHMENT_PROMPT_VERSION } from './prompts/enrichment.js';
import type { GameRelationshipType } from '../domain/shared/game-relationship-type.js';

export { CLASSIFICATION_PROMPT_VERSION, IDENTITY_PROMPT_VERSION, ENRICHMENT_PROMPT_VERSION };

export interface OllamaProviderConfig {
  readonly url: string;
  readonly model: string;
  readonly timeoutMs: number;
}

interface OllamaChatResponse {
  readonly message?: { readonly content?: string };
  readonly error?: string;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private readonly config: OllamaProviderConfig;

  constructor(config: OllamaProviderConfig) {
    this.config = config;
  }

  async classify(request: AIClassificationRequest): Promise<AIClassificationResponse> {
    const userPrompt = this.buildClassificationPrompt(request);
    const response = await this.chat(CLASSIFICATION_SYSTEM_PROMPT, userPrompt);
    return this.parseClassificationResponse(response);
  }

  async resolveIdentity(request: AIIdentityRequest): Promise<AIIdentityResponse> {
    const userPrompt = this.buildIdentityPrompt(request);
    const response = await this.chat(IDENTITY_SYSTEM_PROMPT, userPrompt);
    return this.parseIdentityResponse(response);
  }

  async resolveConflict(
    request: AIEnrichmentConflictRequest,
  ): Promise<AIEnrichmentConflictResponse> {
    const userPrompt = this.buildConflictPrompt(request);
    const response = await this.chat(ENRICHMENT_SYSTEM_PROMPT, userPrompt);
    return this.parseConflictResponse(response);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.config.url}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  getModel(): string {
    return this.config.model;
  }

  // ─── Chat ───────────────────────────────────────────────────

  private async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(`${this.config.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          format: 'json',
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => 'unknown error');
        throw new Error(`Ollama HTTP ${res.status}: ${text}`);
      }

      const data: OllamaChatResponse = (await res.json()) as OllamaChatResponse;

      if (data.error) {
        throw new Error(`Ollama error: ${data.error}`);
      }

      const content = data.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('Ollama returned empty response');
      }

      return content;
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${this.config.timeoutMs}ms`);
      }
      throw err;
    }
  }

  // ─── Prompts ────────────────────────────────────────────────

  private buildClassificationPrompt(req: AIClassificationRequest): string {
    const parts: string[] = [`Title: ${req.title}`];
    if (req.description) {
      parts.push(`Description: ${req.description.slice(0, 500)}`);
    }
    if (req.sourceHints.length > 0) {
      parts.push(`Source hints: ${req.sourceHints.join(', ')}`);
    }
    if (req.genreHints.length > 0) {
      parts.push(`Genre hints: ${req.genreHints.join(', ')}`);
    }
    parts.push(
      `Deterministic result: ${req.deterministicResult.category} (confidence: ${req.deterministicResult.confidence.toFixed(2)})`,
    );
    parts.push(`Reason: ${req.deterministicResult.reason}`);
    return parts.join('\n');
  }

  private buildIdentityPrompt(req: AIIdentityRequest): string {
    return [
      `Candidate: "${req.candidateTitle}"`,
      `  Developers: ${req.candidateDevelopers.join(', ') || 'unknown'}`,
      `  Platforms: ${req.candidatePlatforms.join(', ') || 'unknown'}`,
      `Existing: "${req.existingTitle}"`,
      `  Developers: ${req.existingDevelopers.join(', ') || 'unknown'}`,
      `  Platforms: ${req.existingPlatforms.join(', ') || 'unknown'}`,
      `Deterministic result: ${req.deterministicResult.outcome} (confidence: ${req.deterministicResult.confidence.toFixed(2)})`,
      `Reason: ${req.deterministicResult.reason}`,
    ].join('\n');
  }

  private buildConflictPrompt(req: AIEnrichmentConflictRequest): string {
    return [
      `Field: ${req.fieldType}`,
      `Game: "${req.gameTitle}"`,
      `Source A (${req.sourceA}): "${req.valueA}"`,
      `Source B (${req.sourceB}): "${req.valueB}"`,
      `Which value is more likely correct?`,
    ].join('\n');
  }

  // ─── Response parsing ───────────────────────────────────────

  private parseClassificationResponse(raw: string): AIClassificationResponse {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const category =
      typeof parsed.category === 'string' ? parsed.category.toUpperCase() : 'UNKNOWN';
    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI classification';

    if (
      !VALID_CLASSIFICATION_CATEGORIES.includes(
        category as (typeof VALID_CLASSIFICATION_CATEGORIES)[number],
      )
    ) {
      return {
        category: 'UNKNOWN',
        confidence: 0.3,
        reasoning: `Invalid category from AI: ${category}`,
      };
    }

    return {
      category: category as (typeof VALID_CLASSIFICATION_CATEGORIES)[number],
      confidence,
      reasoning,
    };
  }

  private parseIdentityResponse(raw: string): AIIdentityResponse {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const outcome =
      typeof parsed.outcome === 'string' ? parsed.outcome.toUpperCase() : 'UNRESOLVED';
    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    const reasoning =
      typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI identity resolution';

    let relationship: AIIdentityResponse['relationship'] = null;
    if (
      outcome === 'RELATED_GAME' &&
      typeof parsed.relationship === 'string' &&
      VALID_RELATIONSHIP_TYPES.includes(
        parsed.relationship as (typeof VALID_RELATIONSHIP_TYPES)[number],
      )
    ) {
      relationship = parsed.relationship as GameRelationshipType;
    }

    if (!VALID_IDENTITY_OUTCOMES.includes(outcome as (typeof VALID_IDENTITY_OUTCOMES)[number])) {
      return {
        outcome: 'UNRESOLVED',
        relationship: null,
        confidence: 0.3,
        reasoning: `Invalid outcome from AI: ${outcome}`,
      };
    }

    return {
      outcome: outcome as (typeof VALID_IDENTITY_OUTCOMES)[number],
      relationship,
      confidence,
      reasoning,
    };
  }

  private parseConflictResponse(raw: string): AIEnrichmentConflictResponse {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const recommendedValue =
      typeof parsed.recommendedValue === 'string' ? parsed.recommendedValue : '';
    const reasoning =
      typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI conflict resolution';
    const confidence =
      typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;

    return { recommendedValue, reasoning, confidence };
  }
}
