import mongoose, { Schema, type Document } from 'mongoose';

export interface ATPPlatformDocument extends Document {
  platformId: string;
  slug: string;
  name: string;
  externalIdentities: {
    source: string;
    sourcePlatformId: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const platformExternalIdentitySchema = new Schema(
  {
    source: { type: String, required: true },
    sourcePlatformId: { type: Number, required: true },
  },
  { _id: false },
);

const atpPlatformSchema = new Schema<ATPPlatformDocument>(
  {
    platformId: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    externalIdentities: { type: [platformExternalIdentitySchema], default: [] },
  },
  {
    timestamps: true,
  },
);

// One external identity pair belongs to at most one ATP platform.
atpPlatformSchema.index(
  { 'externalIdentities.source': 1, 'externalIdentities.sourcePlatformId': 1 },
  { unique: true, sparse: true },
);

export const ATPPlatformModel = mongoose.model<ATPPlatformDocument>(
  'ATPPlatform',
  atpPlatformSchema,
);
