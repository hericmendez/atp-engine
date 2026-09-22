import mongoose, { Schema, type Document } from 'mongoose';

export interface CatalogSyncLockDocument extends Document<string> {
  owner: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const catalogSyncLockSchema = new Schema<CatalogSyncLockDocument>(
  {
    _id: { type: String, required: true },
    owner: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  },
);

// TTL for eventual cleanup — not the security mechanism. Acquisition checks expiresAt < now explicitly.
catalogSyncLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CatalogSyncLockModel = mongoose.model<CatalogSyncLockDocument>(
  'CatalogSyncLock',
  catalogSyncLockSchema,
);
