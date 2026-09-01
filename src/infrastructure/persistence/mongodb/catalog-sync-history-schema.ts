import mongoose, { Schema, type Document } from 'mongoose';

export interface CatalogSyncHistoryDocument extends Document {
  startedAt: Date;
  completedAt: Date | null;
  trigger: 'manual' | 'scheduled';
  status: 'running' | 'completed' | 'partial' | 'failed';
  dryRun: boolean;
  from: string;
  to: string;
  requestedPlatformIds: string[];
  resolvedPlatformNames: string[];
  totals: {
    candidatesFound: number;
    newGames: number;
    existingGames: number;
    updatedGames: number;
    rejected: number;
    errors: number;
  };
  platformResults: {
    platformId: string;
    platformName: string;
    candidatesFound: number;
    newGames: number;
    existingGames: number;
    updatedGames: number;
    rejected: number;
    errors: number;
    status: 'completed' | 'failed';
    error: string | null;
  }[];
  error: string | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const syncHistoryTotalsSchema = new Schema(
  {
    candidatesFound: { type: Number, required: true, default: 0 },
    newGames: { type: Number, required: true, default: 0 },
    existingGames: { type: Number, required: true, default: 0 },
    updatedGames: { type: Number, required: true, default: 0 },
    rejected: { type: Number, required: true, default: 0 },
    errors: { type: Number, required: true, default: 0 },
  },
  { _id: false, suppressReservedKeysWarning: true },
);

const syncHistoryPlatformResultSchema = new Schema(
  {
    platformId: { type: String, required: true },
    platformName: { type: String, required: true },
    candidatesFound: { type: Number, required: true, default: 0 },
    newGames: { type: Number, required: true, default: 0 },
    existingGames: { type: Number, required: true, default: 0 },
    updatedGames: { type: Number, required: true, default: 0 },
    rejected: { type: Number, required: true, default: 0 },
    errors: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, enum: ['completed', 'failed'] },
    error: { type: String, default: null },
  },
  { _id: false, suppressReservedKeysWarning: true },
);

const catalogSyncHistorySchema = new Schema<CatalogSyncHistoryDocument>(
  {
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    trigger: { type: String, required: true, enum: ['manual', 'scheduled'] },
    status: { type: String, required: true, enum: ['running', 'completed', 'partial', 'failed'] },
    dryRun: { type: Boolean, required: true, default: false },
    from: { type: String, required: true },
    to: { type: String, required: true },
    requestedPlatformIds: [{ type: String }],
    resolvedPlatformNames: [{ type: String }],
    totals: { type: syncHistoryTotalsSchema, required: true },
    platformResults: [syncHistoryPlatformResultSchema],
    error: { type: String, default: null },
    durationMs: { type: Number, default: null },
  },
  {
    timestamps: true,
  },
);

catalogSyncHistorySchema.index({ startedAt: -1 });
catalogSyncHistorySchema.index({ status: 1 });
catalogSyncHistorySchema.index({ trigger: 1 });
catalogSyncHistorySchema.index({ requestedPlatformIds: 1 });
catalogSyncHistorySchema.index({ completedAt: -1 });

export const CatalogSyncHistoryModel = mongoose.model<CatalogSyncHistoryDocument>(
  'CatalogSyncHistory',
  catalogSyncHistorySchema,
);
