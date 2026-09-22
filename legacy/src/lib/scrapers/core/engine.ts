//src/lib/scrapers/core/engine.ts
import { dedupeResults } from "./dedupe"
import { rankResults } from "./ranker"
import { scrapers } from "./registry"
import { getCoverForGame } from "../cover-search"
import { scrapeWikipediaGames } from "../sources/wikipedia/scraper"

export async function searchGames(
  query: string,
  page = 1,
  limit = 10
) {

  const results = await Promise.all(
    scrapers.map(scraper => scraper.search(query))
  )

  const flat = results.flat()

  const deduped = dedupeResults(flat)

  const ranked = rankResults(deduped, query)

  const start = (page - 1) * limit
  const end = start + limit

  const pageResults = ranked.slice(start, end)

  const validated = await Promise.all(
    pageResults.map(async result => {

      if (result.source !== "wikipedia") {
        return result
      }

      try {
        const data = await scrapeWikipediaGames(result.url)

        if (!data) return null

        return result

      } catch {
        return null
      }

    })
  )

  const clean = validated.filter(Boolean)

  const enriched = await Promise.all(
    clean.map(async game => ({
      ...game,
      cover: await getCoverForGame(game.title)
    }))
  )

  return {
    page,
    limit,
    total: ranked.length,
    results: enriched
  }
}

export async function scrapeGame(source: string, url: string) {

  const scraper = scrapers.find(s => s.source === source)

  if (!scraper) {
    throw new Error(`Unknown scraper source: ${source}`)
  }

  return scraper.scrape(url)
}