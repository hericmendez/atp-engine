"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/stores//useAuthStore"

export function AuthHydrator({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return children
}
