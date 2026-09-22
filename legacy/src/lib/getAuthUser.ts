
// lib/getAuthUser.ts
export async function getAuthUser() {
  const res = await fetch("/api/auth/me", {
    credentials: "include", // importante se usar cookie
  })

  if (!res.ok) {
    return null
  }

  return res.json()
}
