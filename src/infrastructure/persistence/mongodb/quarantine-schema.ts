import mongoose, { Schema, type Document } from 'mongoose';

export interface QuarantinedCandidateDocument extends Document {
  groupId: string;
  source: string;
  sourceId?: string;
  status: 'INELIGIBLE' | 'DEFERRED';
  reason: string;
  blockingReasons: string[];
  classification: string;
  classificationConfidence: number;
  identityConfidence: number;
  sourceCount: number;
  titles: string[];
  retrievedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const quarantineSchema = new Schema<QuarantinedCandidateDocument>(
  {
    groupId: { type: String, required: true, unique: true },
    source: { type: String, required: true },
    sourceId: { type: String, default: undefined },
    status: { type: String, required: true, enum: ['INELIGIBLE', 'DEFERRED'] },
    reason: { type: String, required: true },
    blockingReasons: [{ type: String }],
    classification: { type: String, required: true },
    classificationConfidence: { type: Number, required: true },
    identityConfidence: { type: Number, required: true },
    sourceCount: { type: Number, required: true },
    titles: [{ type: String }],
    retrievedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  },
);

quarantineSchema.index({ status: 1 });
quarantineSchema.index({ source: 1 });

export const QuarantinedCandidateModel = mongoose.model<QuarantinedCandidateDocument>(
  'QuarantinedCandidate',
  quarantineSchema,
);
