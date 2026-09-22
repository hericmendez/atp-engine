
//src/lib/models/game-list.ts
import mongoose from "mongoose";

const GameListSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
});

export const GameList =
  mongoose.models.GameList ||
  mongoose.model("GameList", GameListSchema);
