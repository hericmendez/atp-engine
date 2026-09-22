
export type GameSearchResult = {
  title: string
  url: string
  source: "wikipedia" | "mobygames" | "steam"
}


export type ScrapedGameMetadata = {
  name: string
  summary?: string
  release_date?: number
  developers?: string
  publishers?: string
  genres?: string
  platforms?: string
}

export interface GameScraper {
  search(query: string): Promise<GameSearchResult[]>
  scrape(url: string): Promise<ScrapedGameMetadata | null>
}