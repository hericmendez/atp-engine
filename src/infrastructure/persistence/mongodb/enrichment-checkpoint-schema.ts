import mongoose, { Schema, type Document } from 'mongoose';

export interface EnrichmentCheckpointDocument extends Document {
  key: string;
  mode: string;
  cursor: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  processed: number;
  enriched: number;
  failed: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const enrichmentCheckpointSchema = new Schema<EnrichmentCheckpointDocument>(
  {
    key: { type: String, required: true },
    mode: { type: String, required: true },
    cursor: { type: String, required: true, default: '' },
    status: {
      type: String,
      required: true,
      enum: ['RUNNING', 'COMPLETED', 'FAILED'],
      default: 'RUNNING',
    },
    processed: { type: Number, required: true, default: 0, min: 0 },
    enriched: { type: Number, required: true, default: 0, min: 0 },
    failed: { type: Number, required: true, default: 0, min: 0 },
    error: { type: String, default: undefined },
  },
  {
    timestamps: true,
  },
);

// One row per sweep key. No game data, no ID lists — position only.
enrichmentCheckpointSchema.index({ key: 1 }, { unique: true });
enrichmentCheckpointSchema.index({ status: 1 });

export const EnrichmentCheckpointModel = mongoose.model<EnrichmentCheckpointDocument>(
  'EnrichmentCheckpoint',
  enrichmentCheckpointSchema,
);
