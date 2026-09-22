
//src/stores/useAuthStore.ts
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { getAuthUser } from "@/lib/getAuthUser"

type User = {
  id: string
  name: string
  email: string
}

type AuthState = {
  user: User | null
  loading: boolean

  hydrate: () => Promise<void>
  setUser: (user: User | null) => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loading: true,

      setUser: (user) => set({ user }),

      hydrate: async () => {
        set({ loading: true })

        const user = await getAuthUser()

        set({
          user,
          loading: false,
        })
      },

      logout: async () => {
        await fetch("/api/logout", {
          method: "POST",
          credentials: "include",
        })

        set({ user: null })
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user }),
    }
  )
)
