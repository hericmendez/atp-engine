import type {
  AIClassificationRequest,
  AIClassificationResponse,
  AIIdentityRequest,
  AIIdentityResponse,
  AIEnrichmentConflictRequest,
  AIEnrichmentConflictResponse,
} from './types.js';

export interface LLMProvider {
  readonly name: string;

  classify(request: AIClassificationRequest): Promise<AIClassificationResponse>;

  resolveIdentity(request: AIIdentityRequest): Promise<AIIdentityResponse>;

  resolveConflict(request: AIEnrichmentConflictRequest): Promise<AIEnrichmentConflictResponse>;

  healthCheck(): Promise<boolean>;
}
