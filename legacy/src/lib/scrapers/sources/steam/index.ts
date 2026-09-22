//src/lib/scrapers/sources/steam/index.ts
import { searchSteamGames } from "./search"
import { scrapeSteamGame } from "./scraper"

export const steamScraper = {
  source: "steam",
  search: searchSteamGames,
  scrape: scrapeSteamGame
}