//app/api/game-lists/route.ts
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { getUserId } from '@/lib/auth'
import mongoose from 'mongoose'
import { Game } from '@/lib/models/game'


const GameListSchema = new mongoose.Schema({
  userId: String,
  name: String
})

const GameList =
  mongoose.models.GameList || mongoose.model('GameList', GameListSchema)

// GET → listar listas (opcionalmente por gameId)
export async function GET (req: Request) {
  await connectDB()

  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  const withCount = searchParams.get('withCount') === 'true'

  // 1️⃣ Listas de um jogo específico
  if (gameId) {
    const game = await Game.findOne({ _id: gameId, userId }).lean()
    if (!game) return NextResponse.json([])

    const lists = await GameList.find({
      _id: { $in: game.gameListIds },
      userId
    }).lean()

    return NextResponse.json(lists)
  }

  // 2️⃣ Listas normais
  const lists = await GameList.find({ userId }).lean()

  if (!withCount) {
    return NextResponse.json(lists)
  }

  // 3️⃣ Listas com contagem
  const games = await Game.find({ userId }).lean()
const listsWithCount = lists.map(list => ({
  ...list,
  gamesCount: games.filter(game =>
    game.player_data?.listIds?.some(
      id => id.toString() === list._id.toString()
    )
  ).length
}))


  return NextResponse.json(listsWithCount)
}

// POST → criar lista
export async function POST (req: Request) {
  await connectDB()


const userId = await getUserId()
if (!userId) {
  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401 }
  )
}

  const body = await req.json()

  const list = await GameList.create({
    userId,
    name: body.name
  })

  return NextResponse.json(list)
}
