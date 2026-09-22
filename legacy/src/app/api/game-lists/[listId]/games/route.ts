import { NextResponse } from "next/server"
import { connectDB } from "@/lib/db"
import { getUserId } from "@/lib/auth"
import { Game } from "@/lib/models/game"
import mongoose from "mongoose"
import { GameList } from "@/lib/models/game-list"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  await connectDB()

  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { listId } = await params

  if (!mongoose.Types.ObjectId.isValid(listId)) {
    return NextResponse.json({ error: "Invalid listId" }, { status: 400 })
  }

  const listObjectId = new mongoose.Types.ObjectId(listId)

  const listExists = await GameList.findOne({
    _id: listObjectId,
    userId,
  }).lean()

  if (!listExists) {
    return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 })
  }

  // 📄 parâmetros de paginação
  const { searchParams } = new URL(req.url)

  const page = Number(searchParams.get("page") ?? 1)
  const limit = Number(searchParams.get("limit") ?? 20)

  const skip = (page - 1) * limit

  const query = {
    userId,
    "player_data.listIds": listObjectId,
  }

  const total = await Game.countDocuments(query)

  const games = await Game.find(query)
    .select({
      _id: 1,
      userId: 1,
      "game_data.name": 1,
      "game_data.cover.url": 1,
      "game_data.release_date": 1,
      "game_data.genres": 1,
      "game_data.platforms": 1,
      "player_data.hours_played": 1,
      "player_data.status": 1,
      "player_data.rating": 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ "game_data.name": 1 })
    .skip(skip)
    .limit(limit)
    .lean()

  return NextResponse.json({
    games,
    page,
    limit,
    total,
    hasMore: skip + games.length < total,
  })
}