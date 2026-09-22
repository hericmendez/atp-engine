//src/lib/scrapers/sources/steam/scraper.ts
import * as cheerio from "cheerio"

export async function scrapeSteamGame(url: string) {

  const res = await fetch(url, {
    headers: {
      "User-Agent": "SaveStateBot/1.0"
    }
  })

  if (!res.ok) return null

  const html = await res.text()
  const $ = cheerio.load(html)

  const name = $(".apphub_AppName").first().text().trim()

  const summary = $(".game_description_snippet")
    .text()
    .trim()

  const genres: string[] = []

  $(".details_block a").each((_, el) => {
    const text = $(el).text().trim()
    if (text) genres.push(text)
  })

const releaseDateText = $(".release_date .date")
  .text()
  .trim()

let release_date: number | null = null

if (releaseDateText) {
  const parsed = Date.parse(releaseDateText)

  if (!isNaN(parsed)) {
    release_date = parsed
  }
}
  const developers: string[] = []

  $(".dev_row")
    .filter((_, el) =>
      $(el).text().toLowerCase().includes("developer")
    )
    .find("a")
    .each((_, el) => {
      developers.push($(el).text().trim())
    })
const release_date_str = String(release_date)
return {
  name,
  summary,
  genres,
  developers,
  release_date_str
}
}