//src/lib/models/game.ts
import { model, models, Schema } from "mongoose";
const CoverSchema = new Schema(
  {
    url: { type: String, required: true },
    source: { type: String, required: true },
    confidence: { type: Number, required: true },
  },
  { _id: false }
);


const GameSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    // 🔹 Dados do jogo (imutáveis / descritivos)
    game_data: {
      name: {
        type: String,
        required: true,
      },
      cover: CoverSchema,
      genres: {
        type: String,
      },
      platforms: {
        type: String,
      },
      developers: {
        type: String,
      },
      publishers: {
        type: String,
      },
      release_date: {
        type: String,
      },
      summary: {
        type: String,
      },
    },

    // 🔸 Dados do jogador (subjetivos / mutáveis)
    player_data: {
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

      // 🔗 Relação N:N com GameList
      listIds: [
        {
          type: Schema.Types.ObjectId,
          ref: "GameList",
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

export const Game =
  models.Game || model("Game", GameSchema);
