import type { CoverCheckpoint, CoverCheckpointInput } from './cover-enrichment-checkpoint-types.js';

export interface CoverCheckpointRepository {
  load(key: string): Promise<CoverCheckpoint | null>;
  save(state: CoverCheckpointInput): Promise<CoverCheckpoint>;
}
