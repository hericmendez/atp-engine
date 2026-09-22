import type {
  EnrichmentCheckpoint,
  EnrichmentCheckpointInput,
} from '../../../application/enrichment-checkpoint-types.js';
import type { EnrichmentCheckpointRepository } from '../../../application/enrichment-checkpoint-repository.js';
import { EnrichmentCheckpointModel } from './enrichment-checkpoint-schema.js';

function toDomain(doc: {
  key: string;
  mode: 'needs-companies';
  cursor: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  processed: number;
  enriched: number;
  failed: number;
  error?: string;
  updatedAt: Date;
}): EnrichmentCheckpoint {
  return {
    key: doc.key,
    mode: doc.mode,
    cursor: doc.cursor,
    status: doc.status,
    processed: doc.processed,
    enriched: doc.enriched,
    failed: doc.failed,
    error: doc.error,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class MongoEnrichmentCheckpointRepository implements EnrichmentCheckpointRepository {
  async load(key: string): Promise<EnrichmentCheckpoint | null> {
    const doc = await EnrichmentCheckpointModel.findOne({ key }).lean();
    if (!doc) return null;
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }

  async save(state: EnrichmentCheckpointInput): Promise<EnrichmentCheckpoint> {
    const doc = await EnrichmentCheckpointModel.findOneAndUpdate(
      { key: state.key },
      { $set: { ...state } },
      { upsert: true, new: true },
    ).lean();
    if (!doc) throw new Error('EnrichmentCheckpoint: save returned no document');
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }
}
