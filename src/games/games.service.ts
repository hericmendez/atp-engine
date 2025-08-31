// src/games/games.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { igdbQueryDto } from './dto/igdb-query.dto';
import { getIGDBToken } from '../config/igdb.config';

@Injectable()
export class GamesService {
  private readonly endpoint = 'https://api.igdb.com/v4';

  // Função genérica para chamar IGDB
  private async igdbPost(endpoint: string, body: string) {
    const token = await getIGDBToken(); // token dinâmico
    try {
      const res = await axios.post(`${this.endpoint}/${endpoint}`, body, {
        headers: {
          'Client-ID': process.env.IGDB_CLIENT_ID!,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });
      return res.data;
    } catch (err: any) {
      console.error('Erro IGDB:', err.response?.data || err.message);
      throw new InternalServerErrorException(
        'Erro ao consultar IGDB: ' + err.response?.data?.message || err.message,
      );
    }
  }

  async search(q: igdbQueryDto) {
    const limit = Number(q.limit ?? 10);
    const offset = Number(q.offset ?? 0);
    const sortBy = q.sortBy ?? 'first_release_date';
    const order = (q.order ?? 'desc').toLowerCase();

    const filters: string[] = [];

    // Filtro por release date
    if (q.releaseDate) {  
      const since = Math.floor(new Date(q.releaseDate).getTime() / 1000);
      filters.push(`first_release_date >= ${since}`);
    }



    // Filtro por plataforma
    if (q.platform) {
      const platforms = await this.igdbPost(
        'platforms',
        `fields id,name; where name ~ *"${q.platform}"*; limit 50;`,
      );
      const pids = platforms.map((p: any) => p.id).join(',');
      if (pids) filters.push(`platforms = (${pids})`);
    }

    // Filtro por gênero
    if (q.genre) {
      const genres = await this.igdbPost(
        'genres',
        `fields id,name; where name ~ *"${q.genre}"*; limit 50;`,
      );
      const gids = genres.map((g: any) => g.id).join(',');
      if (gids) filters.push(`genres = (${gids})`);
    }

    // Filtro por título
    const search = q.title ? `search "${q.title}";` : '';
    const where = filters.length ? `where ${filters.join(' & ')};` : '';

    // Corpo completo da query IGDB
let sortLine = '';
if (!q.title) {
  const sortBy = q.sortBy ?? 'first_release_date';
  const order = (q.order ?? 'desc').toLowerCase();
  sortLine = `sort ${sortBy} ${order};`;
}

const body = `
  fields name,genres.name,platforms.name,first_release_date,summary,cover.url;
  ${search}
  ${where}
  ${sortLine}
  limit ${limit};
  offset ${offset};
`;


    return this.igdbPost('games', body);
  }
}
