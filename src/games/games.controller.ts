// src/games/games.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { GamesService } from './games.service';
import { igdbQueryDto } from './dto/igdb-query.dto';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) { }

  @Get()
  async search(@Query() query: igdbQueryDto) {
    const { data, meta } = await this.gamesService.search(query);
    console.log("data ==> ", data);


    const formatted = data.map((game: any) => {
      game.cover = {
        url: game?.cover?.url ? game?.cover?.url?.replace(/t_thumb/, 't_720p') : '',
      };

      game.platforms?.map((platform: any) => {


        platform.platform_logo = {
          url: platform.platform_logo?.url ? platform.platform_logo.url.replace(/t_thumb/, 't_720p') : '',
          id: platform.platform_logo?.id
        }

      })
      return {
        id: game.id,
        name: game.name,
        genres: game.genres ?? [],
        platforms: game.platforms ?? [],
        first_release_date: game.first_release_date ?? null,
        summary: game.summary ?? '',
        cover: game.cover,
        total_rating: game.total_rating ?? null,
      };
    });

    return { data: formatted, meta };
  }
}
