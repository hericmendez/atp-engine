//src/lib/scrapers/core/ranker.ts
import { SearchResult } from "./types"

function normalize(text: string) {
  return text.toLowerCase().trim()
}

function similarity(a: string, b: string) {

  const na = normalize(a)
  const nb = normalize(b)

  if (na === nb) return 1

  if (nb.includes(na)) return 0.9
  if (na.includes(nb)) return 0.9

  return 0.3
}

function metadataScore(result: SearchResult) {

  let score = 0

  if (result.summary) score += 1
  if (result.release_date) score += 1
  if (result.developers?.length) score += 1
  if (result.genres?.length) score += 1
  if (result.platforms?.length) score += 1

  return score
}

const sourceWeight: Record<string, number> = {
  wikipedia: 1,
  mobygames: 0.9,
  steam: 0.8 //isso aqui deveria estar hard coded?
}

function sourceScore(result: SearchResult) {

  if (!result.sources) {
    return sourceWeight[result.source] ?? 0
  }

  let score = 0

  for (const source of result.sources) {
    score += sourceWeight[source] ?? 0
  }

  return score
}

function consensusBonus(result: SearchResult) {

  if (!result.sources) return 0

  const count = result.sources.length

  if (count <= 1) return 0

  return count * 0.5
}

function scoreResult(result: SearchResult, query: string) {
  const titleSimilarity = similarity(query, result.title)


  if (titleSimilarity < 0.5) {
    return -Infinity
  }
  let score = 0

  score += similarity(query, result.title) * 5

  score += sourceScore(result)

  score += metadataScore(result)

  score += consensusBonus(result)

  return score
}

export function rankResults(
  results: SearchResult[],
  query: string
) {

  return results
    .map(result => ({
      ...result,
      score: scoreResult(result, query)
    }))
    .sort((a, b) => b.score - a.score)
}