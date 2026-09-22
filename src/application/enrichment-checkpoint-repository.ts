import type {
  EnrichmentCheckpoint,
  EnrichmentCheckpointInput,
} from './enrichment-checkpoint-types.js';

export interface EnrichmentCheckpointRepository {
  load(key: string): Promise<EnrichmentCheckpoint | null>;
  /** Upsert by key (single row per sweep mode). */
  save(state: EnrichmentCheckpointInput): Promise<EnrichmentCheckpoint>;
}
