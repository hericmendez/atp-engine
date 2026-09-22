// src/lib/scrapers/sources/wikipedia/search.ts

import { SearchResult } from "@/lib/scrapers/core/types"

type WikiSearchResponse = {
  query?: {
    search?: {
      pageid: number
      title: string
      snippet: string
    }[]
  }
}

function normalize(title: string) {
  return title.toLowerCase()
}

function isLikelyGame(title: string) {
  const t = normalize(title)

  const blacklist = [
    "list of",
    "disambiguation",
    "(band)",
    "(film)",
    "video games in",
    "history of",
    "company",
    "publisher"
  ]

  return !blacklist.some(term => t.includes(term))
}

export async function searchWikipediaGames(
  query: string
): Promise<SearchResult[]> {

  const api =
    "https://en.wikipedia.org/w/api.php" +
    "?action=query" +
    "&list=search" +
    "&srsearch=" +
    encodeURIComponent(`${query} video game`) +
    "&srlimit=100" +
    "&format=json"

  const res = await fetch(api)

  if (!res.ok) return []

  const data = (await res.json()) as WikiSearchResponse
  const pages = data.query?.search ?? []

  return pages
    .filter(p => isLikelyGame(p.title))
    .map(p => ({
      title: p.title,
      url: `https://en.wikipedia.org/?curid=${p.pageid}`,
      source: "wikipedia"
    }))
}