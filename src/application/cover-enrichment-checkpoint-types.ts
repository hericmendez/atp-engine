export const COVER_ENRICHMENT_CHECKPOINT_KEY = 'needs-cover';

export type CoverCheckpointStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface CoverCheckpoint {
  readonly key: string;
  readonly mode: 'needs-cover';
  readonly cursor: string;
  readonly status: CoverCheckpointStatus;
  readonly processed: number;
  readonly found: number;
  readonly persisted: number;
  readonly unchanged: number;
  readonly failed: number;
  readonly error?: string;
  readonly updatedAt: string;
}

export type CoverCheckpointInput = Omit<CoverCheckpoint, 'updatedAt'>;
