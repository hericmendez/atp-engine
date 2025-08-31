// src/config/igdb.config.ts
import axios from 'axios';
import qs from 'qs';

export async function getIGDBToken(): Promise<string> {
  const data = qs.stringify({
    client_id: process.env.IGDB_CLIENT_ID || '7ycweysym4du9n1ebktdo5401cx9xf',
    client_secret: process.env.IGDB_CLIENT_SECRET || 'ebdkbc7pv0vcyio673navf2q2c0owm',
    grant_type: 'client_credentials',
  });

  try {
    const res = await axios.post('https://id.twitch.tv/oauth2/token', data, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return res.data.access_token;
  } catch (err: any) {
    console.error('Erro ao obter token IGDB:', err.response?.data || err.message);
    throw err;
  }
}
