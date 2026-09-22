//src/lib/scrapers/core/types.ts (só por desencargo)

export type SearchResult = {

  title: string
  url: string
  source: string

  summary?: string
  developers?: string[]
  publishers?: string[]
  genres?: string[]
  platforms?: string[]
  release_date?: string

  sources?: string[]
  score?: number
}

export type GameMetadata = {
  name: string
  summary?: string
  release_date?: number
  developers?: string[]
  publishers?: string[]
  genres?: string[]
  platforms?: string[]
}

export interface GameScraper {
  source: string

  search(query: string): Promise<SearchResult[]>

  scrape(url: string): Promise<GameMetadata | null>
}