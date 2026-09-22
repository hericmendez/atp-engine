// src/app/api/games/[gameId]/lists/route.ts

import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Game } from '@/lib/models/game'

import { getUserId } from '@/lib/auth'
export async function GET(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params

  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  await connectDB()

  const game = await Game.findOne({
    _id: gameId,
    userId
  }).lean()

  if (game?.game_data) {
    const normalize = (v: any) =>
      Array.isArray(v) ? v.join(", ") : v

    game.game_data.genres = normalize(game.game_data.genres)
    game.game_data.platforms = normalize(game.game_data.platforms)
  }

  return NextResponse.json(game)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params
  const userId = await getUserId()

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()

  await connectDB()

  await Game.updateOne(
    { _id: gameId, userId },
    {
      $set: {
        game_data: body.game_data,
        player_data: body.player_data,
      },
    }
  )

  return NextResponse.json({ ok: true })
}


export async function DELETE (
  req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params
  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()

  await Game.deleteOne({ _id: gameId, userId })

  return NextResponse.json({ ok: true })
}
