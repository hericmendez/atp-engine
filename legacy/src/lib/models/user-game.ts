//src/lib/models/user-game.ts

import { model, models, Schema } from "mongoose";

const UserGameSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    gameId: {
      type: Schema.Types.ObjectId,
      ref: "GlobalGame",
      required: true,
    },

    status: {
      type: String,
    },

    hours_played: {
      type: Number,
      default: 0,
      min: 0,
    },

    times_finished: {
      type: Number,
      min: 0,
    },

    rating: {
      type: Number,
      min: 0,
      max: 10,
    },

    review: {
      type: String,
    },

    listIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "GameList",
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const UserGame =
  models.UserGame || model("UserGame", UserGameSchema);