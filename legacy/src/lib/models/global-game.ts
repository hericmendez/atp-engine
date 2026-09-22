//src/lib/models/global-game.ts
import { model, models, Schema } from "mongoose";

const CoverSchema = new Schema(
  {
    url: { type: String, required: true },
    source: { type: String, required: true },
    confidence: { type: Number, required: true },
  },
  { _id: false }
);

const GlobalGameSchema = new Schema(
  {
    slug: {
      type: String,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      index: true,
    },

    source: {
      type: String,
    },

    source_url: {
      type: String,
      unique: true,
      sparse: true, // evita conflito com null
    },

    cover: CoverSchema,

    genres: [String],
    platforms: [String],
    developers: [String],
    publishers: [String],

    release_date: String,
    summary: String,
  },
  {
    timestamps: true,
  }
);

export const GlobalGame =
  models.GlobalGame || model("GlobalGame", GlobalGameSchema);