import mongoose, { Schema, type Document } from 'mongoose';

export interface PlatformCatalogDocument extends Document {
  platformId: string;
  name: string;
  company: string;
  releaseYear: number | null;
  status: string;
  family: string | null;
  type: string | null;
  thumb: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const platformCatalogSchema = new Schema<PlatformCatalogDocument>(
  {
    platformId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    company: { type: String, required: true },
    releaseYear: { type: Number, default: null },
    status: { type: String, required: true, enum: ['active', 'inactive', 'discontinued'] },
    family: { type: String, default: null },
    type: { type: String, default: null },
    thumb: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

platformCatalogSchema.index({ name: 1 });
platformCatalogSchema.index({ company: 1 });
platformCatalogSchema.index({ releaseYear: 1 });
platformCatalogSchema.index({ status: 1 });
platformCatalogSchema.index({ family: 1 });

export const PlatformCatalogModel = mongoose.model<PlatformCatalogDocument>(
  'PlatformCatalog',
  platformCatalogSchema,
);
