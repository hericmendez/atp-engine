import mongoose, { Schema, type Document } from 'mongoose';

export interface EnrichmentJobDocument extends Document {
  type: string;
  mode: string;
  status: string;
  cursor: string;
  processed: number;
  succeeded: number;
  found: number;
  persisted: number;
  unchanged: number;
  failed: number;
  totalEstimate: number | null;
  batchSize: number;
  ownerId: string | null;
  leaseExpiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastActivityAt: Date;
  startedAt: Date | null;
  pausedAt: Date | null;
  completedAt: Date | null;
  lastMessage: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const enrichmentJobSchema = new Schema<EnrichmentJobDocument>(
  {
    type: { type: String, required: true, enum: ['cover', 'company', 'description', 'alias', 'screenshot'] },
    mode: { type: String, required: true, enum: ['needs-cover', 'needs-companies'] },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'RUNNING', 'PAUSING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'PENDING',
    },
    // '' is the valid initial cursor (domainId > '' includes all, '' means nothing committed).
    // Mongoose `required:true` would incorrectly reject '' as empty, so we allow '' here;
    // domain `EnrichmentJob.cursor: string` remains required (never null/undefined).
    cursor: { type: String, required: false, default: '', validate: { validator: (v: unknown) => typeof v === 'string', message: 'cursor must be a string' } },
    processed: { type: Number, required: true, default: 0, min: 0 },
    succeeded: { type: Number, required: true, default: 0, min: 0 },
    found: { type: Number, required: true, default: 0, min: 0 },
    persisted: { type: Number, required: true, default: 0, min: 0 },
    unchanged: { type: Number, required: true, default: 0, min: 0 },
    failed: { type: Number, required: true, default: 0, min: 0 },
    totalEstimate: { type: Number, default: null },
    batchSize: { type: Number, required: true, min: 1 },
    ownerId: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, default: null },
    lastActivityAt: { type: Date, required: true, default: () => new Date() },
    startedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastMessage: { type: String, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

enrichmentJobSchema.index({ type: 1, status: 1 });
enrichmentJobSchema.index({ status: 1 });
enrichmentJobSchema.index({ leaseExpiresAt: 1 });
enrichmentJobSchema.index({ updatedAt: -1 });

function getModel() {
  if (mongoose.models.EnrichmentJob) {
    return mongoose.model<EnrichmentJobDocument>('EnrichmentJob');
  }
  return mongoose.model<EnrichmentJobDocument>('EnrichmentJob', enrichmentJobSchema);
}

export const EnrichmentJobModel = getModel();
