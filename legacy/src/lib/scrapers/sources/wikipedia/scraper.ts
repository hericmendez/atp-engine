// src/lib/scrapers/sources/wikipedia/scraper.ts
import { GameMetadata } from "@/lib/scrapers/core/types"
import { fetchWikipediaPage } from "./fetch-page"
import { parseInfobox } from "./parse-infobox"
import { parseSummary } from "./parse-summary"
import { searchWikipediaGames } from "./search"

function scoreGameSignals(infobox: any) {

  let score = 0

  if (infobox.developers?.length) score++
  if (infobox.publishers?.length) score++
  if (infobox.genres?.length) score++
  if (infobox.platforms?.length) score++
  if (infobox.release_date) score++

  return score
}

function isGamePage(score: number) {

  // mínimo de sinais para considerar jogo
  return score >= 2
}

export async function scrapeWikipediaGames(url: string) {

  const $ = await fetchWikipediaPage(url)

  const title = $("#firstHeading").text().trim()

  const summary = parseSummary($)
  const infobox = parseInfobox($)

  const signalScore = scoreGameSignals(infobox)

  if (!isGamePage(signalScore)) {
    return null
  }

  return {
    name: title,
    summary,
    ...infobox,
    release_date: infobox.release_date
      ? parseInt(infobox.release_date, 10)
      : undefined
  } as GameMetadata
}


export async function scrapeWikipediaGameMetadata(
  query: string
): Promise<GameMetadata | null> {

  const results = await searchWikipediaGames(query)

  if (!results.length) return null

  const first = results[0]

  const metadata = await scrapeWikipediaGames(first.url)

  return metadata as GameMetadata
}