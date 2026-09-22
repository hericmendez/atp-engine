export type GameQuery = {
  name?: string
  genres?: string[]
  platforms?: string[]
  developers?: string[]
  publishers?: string[]
  release_after?: number
  release_before?: number
}