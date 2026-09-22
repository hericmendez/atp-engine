//app/api/games/[gameId]/lists/[listId]/route.ts

import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { getUserId } from '@/lib/auth'
import { Game } from '@/lib/models/game'


export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; listId: string }> }
) {
  const { gameId, listId } = await params;

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const result = await Game.updateOne(
    { _id: gameId, userId },
    { $addToSet: { "player_data.listIds": listId } }
  );

  return NextResponse.json({
    ok: true,
    modifiedCount: result.modifiedCount,
  });
}



export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  await connectDB()

  const { gameId } = await params
  const { listIds } = await req.json()

  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!Array.isArray(listIds)) {
    return NextResponse.json(
      { error: "listIds must be an array" },
      { status: 400 }
    )
  }

  const result = await Game.updateOne(
    { _id: gameId, userId },
    { $set: { "player_data.listIds": listIds } }
  )

  return NextResponse.json({
    ok: true,
    modifiedCount: result.modifiedCount,
  })
}


export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ gameId: string; listId: string }> }
) {
  const { gameId, listId } = await params;

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const result = await Game.updateOne(
    { _id: gameId, userId },
    { $pull: { "player_data.listIds": listId } }
  );

  return NextResponse.json({
    ok: true,
    modifiedCount: result.modifiedCount,
  });
}
