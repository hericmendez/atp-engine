// src/app/api/games/route.ts


import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'

import { Game } from '@/lib/models/game'
import { getUserId } from '@/lib/auth'



export async function GET() {
  await connectDB()

  const userId = await getUserId()


  console.log('userId ==> ', userId)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const games = await Game.find({ userId }).lean();
  return NextResponse.json(games)
}

export async function POST(req: Request) {
  await connectDB()

  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  }

  const body = await req.json()
  const listIds = Array.isArray(body.player_data?.listIds)
    ? body.player_data.listIds
    : []

  const game = await Game.create({
    userId,
    game_data: body.game_data,
    player_data: {
      ...body.player_data,
      listIds,
    }
  })

  return NextResponse.json(game, { status: 201 })
}
