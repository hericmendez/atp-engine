//src/api/game-lists/[listId]/route.ts
import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { GameList } from '@/lib/models/game-list'
import { Game } from '@/lib/models/game'
import { getUserId } from '@/lib/auth'
type Params = {
  params: {
    listId: string
  }
}

export async function GET(
  req: Request,
  { params }: Params
) {
  await connectDB()

  const { listId } = await params


  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  // 1️⃣ Verifica se a lista existe (e pertence ao usuário)
  const list = await GameList.findOne({
    _id: listId,
    userId
  }).lean()

  if (!list) {
    return NextResponse.json(
      { error: "Lista não encontrada" },
      { status: 404 }
    )
  }

  // 2️⃣ Busca os jogos que pertencem à lista
  const games = await Game.find({

    userId,
    gameListIds: listId
  }).lean()
  return NextResponse.json({
  list,

})

}


export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params
  const { name } = await req.json()

  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await connectDB()

  const result = await GameList.updateOne(
    { _id: listId, userId },
    { name }
  )

  if (result.matchedCount === 0) {
    return NextResponse.json(
      { error: "Lista não encontrada" },
      { status: 404 }
    )
  }

  return NextResponse.json({ ok: true })
}


export async function DELETE (
  req: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params

  const userId = await getUserId()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
    await connectDB()
  const deleted = await GameList.deleteOne({
    _id: listId,
    userId
  })

  if (deleted.deletedCount === 0) {
    return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })
  }

  const result = await Game.updateMany(
    { userId },
    { $pull: { gameListIds: listId } }
  )

  return NextResponse.json({
    ok: true,
    deletedCount: deleted.deletedCount,
    modifiedGames: result.modifiedCount
  })
}
