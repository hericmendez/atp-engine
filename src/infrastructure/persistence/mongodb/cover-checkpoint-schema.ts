import mongoose, { Schema, type Document } from 'mongoose';

export interface CoverCheckpointDocument extends Document {
  key: string;
  mode: string;
  cursor: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  processed: number;
  found: number;
  persisted: number;
  unchanged: number;
  failed: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const coverCheckpointSchema = new Schema<CoverCheckpointDocument>(
  {
    key: { type: String, required: true },
    mode: { type: String, required: true },
    cursor: { type: String, required: true, default: '' },
    status: { type: String, required: true, enum: ['RUNNING', 'COMPLETED', 'FAILED'], default: 'RUNNING' },
    processed: { type: Number, required: true, default: 0, min: 0 },
    found: { type: Number, required: true, default: 0, min: 0 },
    persisted: { type: Number, required: true, default: 0, min: 0 },
    unchanged: { type: Number, required: true, default: 0, min: 0 },
    failed: { type: Number, required: true, default: 0, min: 0 },
    error: { type: String, default: undefined },
  },
  { timestamps: true },
);

coverCheckpointSchema.index({ key: 1 }, { unique: true });
coverCheckpointSchema.index({ status: 1 });

export const CoverCheckpointModel = mongoose.model<CoverCheckpointDocument>(
  'CoverCheckpoint',
  coverCheckpointSchema,
);
