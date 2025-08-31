// src/games/games.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { GamesService } from './games.service';
import { igdbQueryDto } from './dto/igdb-query.dto';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  async search(@Query() query: igdbQueryDto) {
    const results = await this.gamesService.search(query);

    // Transformar cover URL para alta resolução, igual no NextJS
    const formatted = results.map((game: any) => {
      if (game.cover?.url) {
        game.cover = { url: game.cover.url.replace(/t_thumb/g, 't_720p') };
      } else {
        game.cover = { url: '' };
      }
      return game;
    });

    return formatted;
  }
}
