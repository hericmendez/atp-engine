//src/lib/scrapers/sources/steam/search.ts
import { SearchResult } from "@/lib/scrapers/core/types"

type SteamSearchResponse = {
  items?: {
    id: number
    name: string
  }[]
}

export async function searchSteamGames(
  query: string
): Promise<SearchResult[]> {

  const url =
    "https://store.steampowered.com/api/storesearch" +
    "?term=" + encodeURIComponent(query) +
    "&l=english" +
    "&cc=us"

  const res = await fetch(url)

  if (!res.ok) return []

  const data = (await res.json()) as SteamSearchResponse

  const items = data.items ?? []
  const blacklist = [
  "soundtrack",
  "soundtracks",
  "dlc",
  "bundle",
  "demo"
]

const filtered = items.filter(game => {
  const name = game.name.toLowerCase()
  console.log("name ==> ", name);
  return !blacklist.some(term => name.includes(term))
})

  return filtered.slice(0, 5).map(game => ({
    title: game.name,
    url: `https://store.steampowered.com/app/${game.id}`,
    source: "steam"
  }))
}