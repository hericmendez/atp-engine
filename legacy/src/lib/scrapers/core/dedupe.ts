// src/lib/scrapers/core/dedupe.ts

import { SearchResult } from "./types"

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
}

function isSameGame(a: string, b: string) {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)

  if (na === nb) return true

  if (na.includes(nb)) return true
  if (nb.includes(na)) return true

  return false
}

export function dedupeResults(results: SearchResult[]): SearchResult[] {

  const deduped: SearchResult[] = []

  for (const result of results) {

    const existing = deduped.find(r =>
      isSameGame(r.title, result.title)
    )

    if (!existing) {
      deduped.push({
        ...result,
        sources: [result.source]
      })
      continue
    }

    existing.sources = [
      ...(existing.sources ?? []),
      result.source
    ]

    if (!existing.url && result.url) {
      existing.url = result.url
    }
  }

  return deduped
}