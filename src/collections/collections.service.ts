import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { getIGDBToken } from '../config/igdb.config';

@Injectable()
export class CollectionsService {
  private async igdbPost(endpoint: string, body: string) {
    const token = await getIGDBToken();
    const res = await axios.post(`https://api.igdb.com/v4/${endpoint}`, body, {
      headers: {
        'Client-ID': process.env.IGDB_CLIENT_ID! || 'ebdkbc7pv0vcyio673navf2q2c0owm',
        'Authorization': `Bearer ${token}`,
      },
    });
    return res.data;
  }

  platforms() {
    // lista básica (paginável se quiser — adicione limit/offset depois)
    return this.igdbPost('platforms', 'fields id,name,abbreviation,platform_logo.url; limit 200;');
  }

  genres() {
    return this.igdbPost('genres', 'fields id,name; limit 200;');
  }

  goty() {
    // Exemplo simples: retorna jogos com maiores ratings (poderia receber ano por query)
    const body = `
      fields name, total_rating, first_release_date, cover.url;
      sort total_rating desc;
      where total_rating != null;
      limit 50;
    `;
    return this.igdbPost('games', body);
  }
}
