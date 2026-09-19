import mongoose, { Schema, type Document } from 'mongoose';

export interface CatalogSyncStateDocument extends Document {
  source: string;
  scopeType: string;
  scopeId: string;
  pageSize: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  nextOffset: number;
  totalCount: number | null;
  processed: number;
  accepted: number;
  quarantined: number;
  errorCount: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const catalogSyncStateSchema = new Schema<CatalogSyncStateDocument>(
  {
    source: { type: String, required: true },
    scopeType: { type: String, required: true },
    scopeId: { type: String, required: true },
    pageSize: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      required: true,
      enum: ['RUNNING', 'COMPLETED', 'FAILED'],
      default: 'RUNNING',
    },
    nextOffset: { type: Number, required: true, default: 0, min: 0 },
    totalCount: { type: Number, default: null },
    processed: { type: Number, required: true, default: 0 },
    accepted: { type: Number, required: true, default: 0 },
    quarantined: { type: Number, required: true, default: 0 },
    errorCount: { type: Number, required: true, default: 0 },
    startedAt: { type: Date, default: undefined },
    completedAt: { type: Date, default: undefined },
    error: { type: String, default: undefined },
  },
  {
    timestamps: true,
  },
);

// One checkpoint row per ingestion scope. pageSize is intentionally NOT
// part of the identity: resuming with a different pageSize must surface
// as an explicit incompatibility error, not as a second silent row.
catalogSyncStateSchema.index(
  { source: 1, scopeType: 1, scopeId: 1 },
  { unique: true },
);
catalogSyncStateSchema.index({ source: 1 });
catalogSyncStateSchema.index({ status: 1 });

export const CatalogSyncStateModel = mongoose.model<CatalogSyncStateDocument>(
  'CatalogSyncState',
  catalogSyncStateSchema,
);
