import { GameScraper } from "../../core/types";
import { scrapeWikipediaGames } from "./scraper";
import { searchWikipediaGames } from "./search";

export const wikipediaScraper: GameScraper = {
    source: "wikipedia",
    search: searchWikipediaGames,
    scrape: scrapeWikipediaGames
}