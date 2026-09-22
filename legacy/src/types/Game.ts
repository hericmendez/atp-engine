//src/types/

export type Game = {
_id: string,
  game_data: {
    id: number,
    name: string,
    summary: string,
    release_date: number,
    developers: string,
    publishers: string,
    genres: string,
    platforms: string,
    rating: number,
    cover:
    {
      url: string,
      source: string,
      confidence: number
    }
  },

  player_data: {
    status: string,
    hours_played: number,
    times_finished: number,
    rating: number,
    review: string,
    listIds: string[],
  }
}