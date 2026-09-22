import { platform } from 'os'
import z from 'zod'


export const gameFormSchema = z.object({

  game_data: z.object({

    name: z.string().min(1, 'Nome do jogo é obrigatório.'),
    summary: z.string().optional(),
    release_date: z.string().optional(),
    developers: z.string().optional(),
    publishers: z.string().optional(),
    genres: z.string().optional(),
    platforms: z.string().optional(),
    cover: z
      .object({
        url: z.string().url(),
        source: z.string(),
        confidence: z.number().default(0.5)
      })
      .optional()
  }),

  player_data: z.object({
    status: z.string(),
    hours_played: z.number().min(0, 'Horas jogadas não pode ser negativo.'),
    times_finished: z.number().min(0, 'Horas jogadas não pode ser negativo.'),
    rating: z.number().min(0).max(10).optional(),
    review: z.string().optional(),
    listIds: z.array(z.string()).min(1, "Escolha ao menos uma lista"),
  })
})


export const defaultValues = {
  game_data: {

    name: '',
    release_date: 2020,
    developers: '',
    publishers: '',
    genres: '',
    platforms: '',
    cover: {},
    summary: ''

  },
  player_data: {
    status: 'Wishlist',
    hours_played: 0,
    times_finished: 0,
    rating: 0,
    review:
      ''

  }
}
