import { create } from "zustand"

export type GameList = {
  _id: string
  name: string
  gamesCount?: number
}

export type GameShort = {
  _id: string
  userId: string
  game_data: {
    name: string
    cover?: {
      url: string
    }
    release_date?: string
  }
  createdAt: string
  updatedAt: string
}

type GameListsState = {
  lists: GameList[]

  gamesByList: Record<string, GameShort[]>
  pageByList: Record<string, number>
  hasMoreByList: Record<string, boolean>

  loading: boolean
  error: string | null

  loadLists: () => Promise<void>

  loadGamesFromList: (
    listId: string,
    page?: number
  ) => Promise<{ hasMore: boolean }>

  createList: (name: string) => Promise<void>
  updateList: (listId: string, name: string) => Promise<void>
  deleteList: (listId: string) => Promise<void>

  resolveGameLists: (listIds: string[]) => GameList[]
}


export const useGameListsStore = create<GameListsState>((set, get) => ({
  lists: [],

  gamesByList: {},
  pageByList: {},
  hasMoreByList: {},

  loading: false,
  error: null,

  loadLists: async () => {
    try {
      set({ loading: true, error: null })

      const res = await fetch("/api/game-lists?withCount=true")
      if (!res.ok) throw new Error(`Erro ${res.status}`)

      const lists = await res.json()

      set({ lists })
    } catch (err) {
      console.error("loadLists:", err)
      set({ error: "Erro ao carregar listas" })
    } finally {
      set({ loading: false })
    }
  },

  loadGamesFromList: async (listId: string, page = 1) => {
    try {
      set({ loading: true, error: null })

      const res = await fetch(
        `/api/game-lists/${listId}/games?page=${page}&limit=20`
      )

      if (!res.ok) throw new Error(`Erro ${res.status}`)

      const data = await res.json()

      set((state) => ({
        gamesByList: {
          ...state.gamesByList,
          [listId]:
            page === 1
              ? data.games
              : [...(state.gamesByList[listId] ?? []), ...data.games],
        },

        pageByList: {
          ...state.pageByList,
          [listId]: page,
        },

        hasMoreByList: {
          ...state.hasMoreByList,
          [listId]: data.hasMore,
        },
      }))

      return { hasMore: data.hasMore }
    } catch (err) {
      console.error("loadGamesFromList:", err)
      set({ error: "Erro ao carregar jogos da lista" })
      return { hasMore: false }
    } finally {
      set({ loading: false })
    }
  },




  createList: async (name) => {
    await fetch("/api/game-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    await get().loadLists();
  },

  updateList: async (listId, name) => {
    await fetch(`/api/game-lists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    await get().loadLists();
  },

  deleteList: async (listId) => {
    await fetch(`/api/game-lists/${listId}`, {
      method: "DELETE",
    });

    await get().loadLists();
  },
  resolveGameLists: (listIds: string[]) => {
    const { lists } = get();
    return lists.filter(l => listIds.includes(l._id));
  }


}));
