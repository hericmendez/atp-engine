//src/lib/scrapers/query/match.ts
import { SearchResult } from "../core/types"
import { GameQuery } from "./types"

export function matchGame(game: SearchResult, query: GameQuery) {

  if (query.genres) {

    const genres = game.genres?.map(g => g.toLowerCase()) ?? []

    if (!query.genres.some(g =>
      genres.some(x => x.includes(g.toLowerCase()))
    )) {
      return false
    }

  }

  if (query.platforms) {

    const platforms = game.platforms?.map(p => p.toLowerCase()) ?? []

    if (!query.platforms.some(p =>
      platforms.some(x => x.includes(p.toLowerCase()))
    )) {
      return false
    }

  }

  if (query.publishers) {

    const pubs = game.publishers?.map(p => p.toLowerCase()) ?? []

    if (!query.publishers.some(p =>
      pubs.some(x => x.includes(p.toLowerCase()))
    )) {
      return false
    }

  }
  const release_date= Number(game.release_date|| 0)
  if (query.release_after && release_date) {

    if (release_date < query.release_after) {
      return false
    }

  }

  if (query.release_before && release_date) {

    if (release_date > query.release_before) {
      return false
    }

  }

  return true
}