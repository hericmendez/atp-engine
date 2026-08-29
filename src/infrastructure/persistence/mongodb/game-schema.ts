import mongoose, { Schema, type Document } from 'mongoose';

export interface GameDocument extends Document {
  domainId: string;
  titles: {
    value: string;
    type: string;
  }[];
  releases: {
    domainId: string;
    platform: { name: string; family: string | null; type: string };
    region: { name: string } | null;
    releaseDate: {
      year: number;
      month: number | null;
      day: number | null;
      precision: string;
    } | null;
    version: string | null;
    edition: string | null;
    distributionChannels: { name: string }[];
    launchers: { name: string }[];
    externalIdentifiers: {
      source: string;
      id: string;
    }[];
    evidence: {
      source: string;
      externalId: string;
      retrievedAt: Date;
      rawTitle: string | null;
    }[];
  }[];
  developers: { name: string }[];
  publishers: { name: string }[];
  genres: { name: string }[];
  externalIdentifiers: {
    source: string;
    id: string;
  }[];
  relationships: {
    sourceGameId: string;
    targetGameId: string;
    type: string;
  }[];
  evidence: {
    source: string;
    externalId: string;
    retrievedAt: Date;
    rawTitle: string | null;
  }[];
  classification: string;
  completeness: string;
  createdAt: Date;
  updatedAt: Date;
}

const releaseDateSchema = new Schema(
  {
    year: { type: Number, required: true },
    month: { type: Number, default: null },
    day: { type: Number, default: null },
    precision: { type: String, required: true, enum: ['year', 'month', 'day'] },
  },
  { _id: false },
);

const externalIdentifierSchema = new Schema(
  {
    source: { type: String, required: true },
    id: { type: String, required: true },
  },
  { _id: false },
);

const sourceEvidenceSchema = new Schema(
  {
    source: { type: String, required: true },
    externalId: { type: String, required: true },
    retrievedAt: { type: Date, required: true },
    rawTitle: { type: String, default: null },
  },
  { _id: false },
);

const distributionChannelSchema = new Schema(
  {
    name: { type: String, required: true },
  },
  { _id: false },
);

const launcherSchema = new Schema(
  {
    name: { type: String, required: true },
  },
  { _id: false },
);

const releaseSchema = new Schema(
  {
    domainId: { type: String, required: true },
    platform: {
      name: { type: String, required: true },
      family: { type: String, default: null },
      type: { type: String, default: 'other' },
    },
    region: {
      name: { type: String, default: null },
    },
    releaseDate: { type: releaseDateSchema, default: null },
    version: { type: String, default: null },
    edition: { type: String, default: null },
    distributionChannels: [distributionChannelSchema],
    launchers: [launcherSchema],
    externalIdentifiers: [externalIdentifierSchema],
    evidence: [sourceEvidenceSchema],
  },
  { _id: false },
);

const gameRelationshipSchema = new Schema(
  {
    sourceGameId: { type: String, required: true },
    targetGameId: { type: String, required: true },
    type: { type: String, required: true },
  },
  { _id: false },
);

const gameSchema = new Schema<GameDocument>(
  {
    domainId: { type: String, required: true, unique: true },
    titles: [
      {
        value: { type: String, required: true },
        type: { type: String, required: true },
      },
    ],
    releases: [releaseSchema],
    developers: [
      {
        name: { type: String, required: true },
      },
    ],
    publishers: [
      {
        name: { type: String, required: true },
      },
    ],
    genres: [
      {
        name: { type: String, required: true },
      },
    ],
    externalIdentifiers: [externalIdentifierSchema],
    relationships: [gameRelationshipSchema],
    evidence: [sourceEvidenceSchema],
    classification: { type: String, required: true },
    completeness: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

gameSchema.index(
  { 'externalIdentifiers.source': 1, 'externalIdentifiers.id': 1 },
  { unique: true, sparse: true },
);
gameSchema.index({ 'titles.value': 1 });

export const GameModel = mongoose.model<GameDocument>('Game', gameSchema);
