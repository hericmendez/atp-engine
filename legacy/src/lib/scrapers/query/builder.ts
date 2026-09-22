//src/lib/scrapers/query/builder.ts
import { GameQuery } from "./types"

export function buildGameQuery(params: URLSearchParams): GameQuery {

  const query: GameQuery = {}

  const name = params.get("name")
  const genre = params.get("genre")
  const platform = params.get("platform")
  const developer = params.get("developer")
  const publisher = params.get("publisher")
  const after = params.get("after")
  const before = params.get("before")

  if (name) query.name = name

  if (genre) {
    query.genres = genre.split(",")
  }

  if (platform) {
    query.platforms = platform.split(",")
  }

  if (developer) {
    query.developers = developer.split(",")
  }

  if (publisher) {
    query.publishers = publisher.split(",")
  }

  if (after) {
    query.release_after = Number(after)
  }

  if (before) {
    query.release_before = Number(before)
  }

  return query
}