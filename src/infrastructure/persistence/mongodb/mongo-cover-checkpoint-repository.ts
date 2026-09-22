import type { CoverCheckpoint, CoverCheckpointInput } from '../../../application/cover-enrichment-checkpoint-types.js';
import type { CoverCheckpointRepository } from '../../../application/cover-enrichment-checkpoint-repository.js';
import { CoverCheckpointModel } from './cover-checkpoint-schema.js';

function toDomain(doc: {
  key: string;
  mode: 'needs-cover';
  cursor: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  processed: number;
  found: number;
  persisted: number;
  unchanged: number;
  failed: number;
  error?: string;
  updatedAt: Date;
}): CoverCheckpoint {
  return {
    key: doc.key,
    mode: doc.mode,
    cursor: doc.cursor,
    status: doc.status,
    processed: doc.processed,
    found: doc.found,
    persisted: doc.persisted,
    unchanged: doc.unchanged,
    failed: doc.failed,
    error: doc.error,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class MongoCoverCheckpointRepository implements CoverCheckpointRepository {
  async load(key: string): Promise<CoverCheckpoint | null> {
    const doc = await CoverCheckpointModel.findOne({ key }).lean();
    if (!doc) return null;
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }
  async save(state: CoverCheckpointInput): Promise<CoverCheckpoint> {
    const doc = await CoverCheckpointModel.findOneAndUpdate({ key: state.key }, { $set: { ...state } }, { upsert: true, new: true }).lean();
    if (!doc) throw new Error('CoverCheckpoint: save returned no document');
    return toDomain(doc as Parameters<typeof toDomain>[0]);
  }
}
