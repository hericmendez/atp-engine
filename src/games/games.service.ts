import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { igdbQueryDto } from './dto/igdb-query.dto';
import { getIGDBToken } from '../config/igdb.config';

@Injectable()
export class GamesService {
  private readonly endpoint = 'https://api.igdb.com/v4';

  private async igdbPost(endpoint: string, body: string) {
    const token = await getIGDBToken();
    try {
      const res = await axios.post(`${this.endpoint}/${endpoint}`, body, {
        headers: {
          'Client-ID': process.env.IGDB_CLIENT_ID!,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          "Accept-Language": "pt-BR",
        },
      });
      return res.data;
    } catch (err: any) {
      console.error('Erro IGDB:', err.response?.data || err.message);
      throw new InternalServerErrorException(
        'Erro ao consultar IGDB: ' + (err.response?.data?.message || err.message),
      );
    }
  }
// src/games/games.service.ts
async search(q: igdbQueryDto) {
  const limit = Math.min(Number(q.limit ?? 100), 500); 
  const offset = Number(q.offset ?? 0);

  const filters: string[] = [];

  // Filtro release date
  if (q.releaseDate) {
    const since = Math.floor(new Date(q.releaseDate).getTime() / 1000);
    filters.push(`first_release_date >= ${since}`);
  }

  // Filtro plataforma
  if (q.platform) {
    const platforms = await this.igdbPost(
      'platforms',
      `fields id,name; where name ~ *"${q.platform}"*; limit 50;`,
    );
    const pids = platforms.map((p: any) => p.id).join(',');
    if (pids) filters.push(`platforms = (${pids})`);
  }

  // Filtro gênero
  if (q.genre) {
    const genres = await this.igdbPost(
      'genres',
      `fields id,name; where name ~ *"${q.genre}"*; limit 50;`,
    );
    const gids = genres.map((g: any) => g.id).join(',');
    if (gids) filters.push(`genres = (${gids})`);
  }

  // Só categorias oficiais
  filters.push(`category = (0)`); 

  
  const gameFullQuery = `
    fields 
    id, name, summary, storyline, first_release_date,
    genres.name, platforms.name, platforms.platform_logo.url,
    cover.url, screenshots.url, artworks.url,
    involved_companies.company.name, involved_companies.publisher,
    rating, aggregated_rating, follows, hypes,
    game_localizations.name, game_localizations.region,
    language_supports.language.name, language_supports.language_support_type.name,
    similar_games.name, franchise.name, collection.name,
    version_parent, category, status;
  `;

  const gameShortQuery = `
    fields 
      id, name, first_release_date,
      genres.name, platforms.name,
      cover.url,
      involved_companies.company.name, involved_companies.publisher,
      aggregated_rating,
      version_parent, category, status;
  `;

  const whereLine = filters.length ? `where ${filters.join(' & ')};` : '';
  const searchLine = q.title ? `search "${q.title}";` : '';
  const sortBy = q.sortBy ?? 'total_rating';
  const order = (q.order ?? 'desc').toLowerCase();
  const sortLine = q.title ? '' : `sort ${sortBy} ${order};`;

  const body = `
    ${q.short ? gameShortQuery : gameFullQuery}

    ${whereLine}
        ${searchLine}
    ${sortLine}
    limit ${limit};
    offset ${offset};
  `;

  console.log('IGDB query:', body); // debug

  let data = await this.igdbPost('games', body);

  // === Agrupar por jogo pai (version_parent) ===
  const parents: Record<number, any> = {};
  const orphans: any[] = [];

  for (const game of data) {
    if (game.version_parent) {
      const parentId = game.version_parent;
      if (!parents[parentId]) {
        parents[parentId] = { versions: [] };
      }
      parents[parentId].versions.push(game);
    } else {
      parents[game.id] = { ...game, versions: [] };
    }
  }

  // Se tiver pai faltando, buscar no IGDB
  for (const parentId of Object.keys(parents)) {
    const group = parents[+parentId];
    if (!group.id) {
      const parentGame = await this.igdbPost('games', `
        fields id, name, cover.url, category, status;
        where id = ${parentId};
        limit 1;
      `);
      if (parentGame?.length) {
        parents[+parentId] = { ...parentGame[0], versions: group.versions };
      } else {
        // fallback: manter os filhos mesmo sem pai
        orphans.push(...group.versions);
      }
    }
  }

  data = [...Object.values(parents), ...orphans];
// === count total ===
let total: number | null = null;
let totalPages: number | null = null;

// NÃO chamamos count quando há search/title porque IGDB não aceita `search` + `count;`
if (!q.title) {
  const rawWhere = filters.join(' & '); // condições sem "where" no começo
  total = await this.igdbCount('games', rawWhere);
  totalPages = total ? Math.ceil(total / limit) : null;
} else {
  // se for busca por título, devolvemos total = null e usamos hasMore
  total = null;
  totalPages = null;
}


  const page = Math.floor(offset / limit) + 1;

  return {
    data,
    meta: {
      page,
      limit,
      offset,
      total,
      totalPages,
      hasMore: data.length === limit,
    },
  };
}



private async igdbCount(endpoint: string, whereLine: string) {
  const token = await getIGDBToken();
  try {
    let clause = (whereLine ?? '').toString().trim();

    // se veio vazio, não tenta contar
    if (!clause) return 0;

    // garante que a cláusula começa com "where"
    if (!/^where\s+/i.test(clause)) clause = `where ${clause}`;

    // garante ponto-e-vírgula no final da cláusula WHERE
    if (!clause.trim().endsWith(';')) clause = `${clause};`;

    const body = `${clause}\ncount;`;

    const res = await axios.post(`${this.endpoint}/${endpoint}`, body, {
      headers: {
        'Client-ID': process.env.IGDB_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    return res.data?.[0]?.count ?? 0;
  } catch (err: any) {
    console.error('Erro IGDB Count:', err.response?.data || err.message);
    throw new InternalServerErrorException(
      'Erro ao consultar contagem IGDB: ' + (err.response?.data?.message || err.message),
    );
  }
}


}
