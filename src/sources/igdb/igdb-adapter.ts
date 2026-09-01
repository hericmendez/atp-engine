import { BaseAdapter, type BaseAdapterConfig } from '../base-adapter.js';
import type { SearchOptions, SearchResult } from '../source-adapter.js';
import type { RawCandidate } from '../raw-candidate.js';
import { SourceError } from '../source-errors.js';
import { logger } from '../../infrastructure/logger/logger.js';

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface IgdbGame {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  first_release_date?: number;
  genres?: number[];
  platforms?: number[];
  involved_companies?: number[];
  cover?: { id: string; url: string; image_id?: string };
  screenshots?: Array<{ id: string; url: string; image_id?: string }>;
  themes?: number[];
  game_modes?: number[];
  player_perspectives?: number[];
  storyline?: string;
  url?: string;
}

const IGDB_PLATFORM_MAP: Record<number, string> = {
  3: 'Linux',
  6: 'PC',
  9: 'Nintendo 3DS',
  13: 'Nintendo DS',
  14: 'Mac',
  18: 'NES',
  19: 'SNES',
  20: 'Nintendo 64',
  21: 'GameCube',
  22: 'Game Boy Advance',
  23: 'Game Boy Color',
  24: 'Game Boy',
  34: 'Wii',
  38: 'PlayStation Portable',
  39: 'iOS',
  41: 'Wii U',
  48: 'PlayStation 4',
  49: 'PlayStation 5',
  130: 'Nintendo Switch',
  162: 'Oculus VR',
  163: 'SteamVR',
  167: 'PlayStation VR',
  169: 'PlayStation VR2',
  29: 'TurboGrafx-16',
  30: 'Sega Master System',
  32: 'Sega Game Gear',
  33: 'Game & Watch',
  35: 'Sega Dreamcast',
  36: 'Sega Saturn',
  37: '3DO Interactive Multiplayer',
  42: 'Neo Geo',
  43: 'Commodore C64',
  44: 'Amiga',
  45: 'Atari 2600',
  46: 'Atari 7800',
  47: 'Atari Lynx',
  50: 'Atari ST',
  51: 'Sega Mega Drive/Genesis',
  52: 'Sega 32X',
  53: 'Sega CD',
  54: 'Arcade',
  55: 'MSX',
  57: 'Vectrex',
  58: 'Virtual Console',
  59: 'Nintendo GameCube',
  60: 'Game.com',
  61: 'N-Gage',
  62: 'Tapwave Zodiac',
  63: 'WonderSwan Color',
  64: 'SwanCrystal',
  67: 'Intellivision',
  68: 'ColecoVision',
  71: 'BBC Micro',
  73: 'ZX Spectrum',
  74: 'MSX2',
  75: 'Commodore VIC-20',
  76: 'Ouya',
  77: 'Windows Phone',
  78: 'Nintendo DSi',
  82: 'PlayStation 5',
  83: 'Android',
  84: 'Atari 800',
  85: 'Atari 5200',
  86: 'SG-1000',
  87: 'Sega Pico',
  88: 'R-Zone',
  89: 'Nintendo Play Mas',
  90: 'Plug & Play',
  91: 'Game Wave',
  95: 'Sega CD',
  97: 'TurboGrafx-16',
  113: 'Amiga CD32',
  114: 'Apple IIGS',
  115: 'LaserActive',
  116: 'PK-2200',
  117: 'Amstrad GX4000',
  119: 'Game & Watch',
  123: 'Satellaview',
  124: 'Game Boy Pocket',
  125: 'Game Boy Light',
  128: 'PlayStation 5',
  129: 'Dreamcast',
  131: 'Nintendo DS Lite',
  132: 'Nintendo DSi LL',
  133: 'Nintendo 3DS XL',
  134: 'Game Boy Advance SP',
  135: 'Game Boy Color',
  137: 'SegaNomad',
  138: 'Nuon',
  139: 'Wondermega',
  141: 'XavixPORT',
  142: 'iQue Player',
  143: 'Playdia',
  144: "Super A'Can",
  145: 'Nintendo 64 DD',
  146: 'Leapster',
  147: 'Leapster L-Max',
  148: 'LeapPad',
  149: 'V.Smile',
  150: 'V.Smile Motion',
  151: 'PlayStation Vita',
  152: 'PocketStation',
  153: 'Sega Pico',
  154: 'Game & Watch: Super Mario Bros.',
  155: 'Ouya',
  156: 'Nintendo DSi XL',
  157: 'LeapTV',
  158: 'R-Zone',
  159: 'VMU',
  160: 'Nintendo 2DS',
  161: 'Apple Pippin',
  164: 'PlayStation Now',
  166: 'Hyper Scan',
  168: 'Evercade',
  170: 'Meta Quest 2',
  171: 'Meta Quest Pro',
  172: 'PlayStation VR2',
  173: 'Xbox Series X|S',
  174: 'Analogue Pocket',
  175: 'Game & Watch: The Legend of Zelda',
  176: 'Game & Watch: Super Mario Bros.',
  177: 'Game & Watch: Ball',
  178: 'Game & Watch: Judge',
  179: 'Game & Watch: Manhole',
  180: 'Game & Watch: Vermin',
  181: 'Game & Watch: Fire',
  182: 'Game & Watch: Gold Cliff',
  183: 'Game & Watch: Octopus',
  184: 'Game & Watch: Chef',
  185: 'Game & Watch: Tropical Fish',
  186: 'Game & Watch: Egg',
  187: 'Game & Watch: Snoopy',
  188: 'Game & Watch: Popeye',
  189: 'Game & Watch: Donkey Kong',
  190: 'Game & Watch: Mario Bros.',
  191: 'Game & Watch: Spitball',
  192: 'Game & Watch: Bucket',
  193: 'Game & Watch: Parachute',
  194: 'Game & Watch: Helmet',
  195: 'Game & Watch: Shoeshine',
  196: 'Game & Watch: Octopus',
  197: 'Game & Watch: Computer',
  198: 'Game & Watch: Green House',
  199: 'Game & Watch: Donkey Kong II',
  200: 'Game & Watch: Boxing',
  201: 'Game & Watch: Rain Shower',
  202: 'Game & Watch: Lifeboat',
  203: 'Game & Watch: Pitfall!',
  204: 'Game & Watch: Black Jack',
  205: 'Game & Watch: Squish',
  206: 'Game & Watch: Turtle Bridge',
  207: 'Game & Watch: Fire Attack',
  208: 'Game & Watch: Mario Bros.',
  209: 'Game & Watch: Stoner',
  210: 'Game & Watch: Egg',
  211: 'Game & Watch: Goldfish',
  212: 'Game & Watch: Snoopy',
  213: 'Game & Watch: Popeye',
  214: 'Game & Watch: Donkey Kong',
  215: 'Game & Watch: Mickey Mouse',
  216: 'Game & Watch: Donkey Kong Jr.',
  217: 'Game & Watch: Mario Bros.',
  218: 'Game & Watch: Ball',
  219: 'Game & Watch: Flagman',
  220: 'Game & Watch: Vermin',
  221: 'Game & Watch: Fire',
  222: 'Game & Watch: Manhole',
  223: 'Game & Watch: Judge',
  224: 'Game & Watch: Lion',
  225: 'Game & Watch: Bomb',
  226: 'Game & Watch: Tropical Fish',
  227: 'Game & Watch: Snoopy',
  228: 'Game & Watch: Egg',
  229: 'Game & Watch: Fire',
  307: 'Oculus Quest 2',
  308: 'Meta Quest 2',
  309: 'Oculus Quest',
  310: 'Oculus Rift',
  311: 'Oculus Go',
  312: 'Oculus Quest Pro',
  320: 'Daydream',
  321: 'Samsung Gear VR',
  322: 'HTC Vive',
  323: 'Valve Index',
  324: 'Windows Mixed Reality',
  325: 'Pico 4',
  326: 'PlayStation VR',
};

const IGDB_GENRE_MAP: Record<number, string> = {
  2: 'Point-and-click',
  4: 'Fighting',
  5: 'Shooter',
  7: 'Music',
  8: 'Platform',
  9: 'Puzzle',
  10: 'Racing',
  11: 'Real Time Strategy (RTS)',
  12: 'Role-playing (RPG)',
  13: 'Simulator',
  14: 'Sport',
  15: 'Strategy',
  16: 'Turn-based strategy (TBS)',
  17: 'Tactical',
  18: "Hack and slash/Beat 'em up",
  19: 'Quiz/Trivia',
  20: 'Pinball',
  21: 'Adventure',
  22: 'Indie',
  23: 'Arcade',
  24: 'Visual Novel',
  25: 'Card & Board Game',
  26: 'MOBA',
  27: 'Pinball',
  28: 'Massively Multiplayer Online (MMO)',
  30: 'Digital Card Game',
  31: 'Adventure',
  32: 'Indie',
  33: 'Tactical RPG',
  34: 'Cards',
  35: 'Battle Royale',
};

const IGDB_IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload';

export type IgdbAdapterConfig = Omit<BaseAdapterConfig, 'baseUrl'> & {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly baseUrl?: string;
};

export class IgdbAdapter extends BaseAdapter {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: IgdbAdapterConfig) {
    super(
      {
        ...config,
        baseUrl: config.baseUrl ?? 'https://api.igdb.com/v4',
      },
      {
        search: true,
        getById: true,
        searchCovers: true,
        searchPagination: 'offset',
      },
    );
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    const token = await this.getAccessToken();

    const body = [
      `search "${query.replace(/"/g, '\\"')}";`,
      'fields name, slug, summary, first_release_date, genres, platforms, involved_companies, cover.image_id, screenshots.image_id, themes;',
      `limit ${limit};`,
      `offset ${offset};`,
      'where category = 0;', // Main game category
    ].join(' ');

    const data = await this.postApi<IgdbGame[]>('/games', body, token);

    const candidates = data.map((game) => this.gameToCandidate(game));

    return {
      candidates,
      totalEstimate: undefined,
      hasMore: data.length === limit,
    };
  }

  async getById(id: string): Promise<RawCandidate | null> {
    const igdbId = parseInt(id, 10);
    if (isNaN(igdbId)) {
      return null;
    }

    const token = await this.getAccessToken();

    const body = [
      `where id = ${igdbId};`,
      'fields name, slug, summary, first_release_date, genres, platforms, involved_companies, cover.image_id, screenshots.image_id, themes;',
    ].join(' ');

    const data = await this.postApi<IgdbGame[]>('/games', body, token);

    if (!data || data.length === 0) {
      return null;
    }

    const game = data[0];

    // Fetch company details if available
    if (game.involved_companies && game.involved_companies.length > 0) {
      const companies = await this.fetchCompanies(game.involved_companies, token);
      return this.gameToCandidate(game, companies);
    }

    return this.gameToCandidate(game);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const url = `https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=client_credentials`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      throw new SourceError(
        this.source,
        'authentication_failure',
        `Twitch OAuth failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as TwitchTokenResponse;
    this.accessToken = data.access_token;
    // Refresh 1 hour before expiry
    this.tokenExpiresAt = Date.now() + (data.expires_in - 3600) * 1000;

    return this.accessToken;
  }

  private async postApi<T>(endpoint: string, body: string, token: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const startTime = Date.now();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Client-ID': this.clientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new SourceError(this.source, 'rate_limited', `Rate limited: ${url}`);
        }
        if (response.status === 401) {
          // Token might be expired, reset and retry once
          this.accessToken = null;
          this.tokenExpiresAt = 0;
          throw new SourceError(this.source, 'authentication_failure', `Unauthorized: ${url}`);
        }
        throw new SourceError(this.source, 'invalid_response', `HTTP ${response.status}: ${url}`);
      }

      const data = (await response.json()) as T;
      const durationMs = Date.now() - startTime;

      this.logRequest(url, response.status, durationMs, true);

      return data;
    } catch (error) {
      const durationMs = Date.now() - startTime;

      if (error instanceof SourceError) {
        this.logRequest(url, 0, durationMs, false, error.message);
        throw error;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        this.logRequest(url, 0, durationMs, false, 'timeout');
        throw new SourceError(
          this.source,
          'timeout',
          `Request timed out after ${this.timeoutMs}ms`,
        );
      }

      this.logRequest(url, 0, durationMs, false, String(error));
      throw new SourceError(
        this.source,
        'network_failure',
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private logRequest(
    url: string,
    statusCode: number,
    durationMs: number,
    success: boolean,
    errorType?: string,
  ): void {
    if (success) {
      logger.info('source.request.completed', {
        source: this.source,
        operation: 'postApi',
        url,
        statusCode,
        durationMs,
        success,
      });
    } else {
      logger.warn('source.request.failed', {
        source: this.source,
        operation: 'postApi',
        url,
        errorType,
        durationMs,
        success,
      });
    }
  }

  private async fetchCompanies(
    companyIds: number[],
    token: string,
  ): Promise<Array<{ name: string; developer: boolean; publisher: boolean }>> {
    if (companyIds.length === 0) {
      return [];
    }

    const body = [`where id = (${companyIds.join(',')});`, 'fields name;'].join(' ');

    try {
      const data = await this.postApi<Array<{ id: number; name: string }>>(
        '/companies',
        body,
        token,
      );

      // Since we can't get role info from the companies endpoint directly,
      // we'll mark all as both developer and publisher (conservative approach)
      return data.map((c) => ({
        name: c.name,
        developer: true,
        publisher: true,
      }));
    } catch {
      return [];
    }
  }

  private gameToCandidate(
    game: IgdbGame,
    companies?: Array<{ name: string; developer: boolean; publisher: boolean }>,
  ): RawCandidate {
    const platforms = (game.platforms ?? [])
      .map((id) => IGDB_PLATFORM_MAP[id])
      .filter((name): name is string => Boolean(name));

    const genres = (game.genres ?? [])
      .map((id) => IGDB_GENRE_MAP[id])
      .filter((name): name is string => Boolean(name));

    const developers = (companies ?? []).filter((c) => c.developer).map((c) => c.name);

    const publishers = (companies ?? []).filter((c) => c.publisher).map((c) => c.name);

    const releaseDate = game.first_release_date ? this.unixToDate(game.first_release_date) : null;

    const coverUrl = game.cover?.image_id
      ? `${IGDB_IMAGE_BASE}/t_cover_big/${game.cover.image_id}.png`
      : undefined;

    const screenshotUrls = (game.screenshots ?? [])
      .filter((s) => s.image_id)
      .map((s) => `${IGDB_IMAGE_BASE}/t_screenshot_big/${s.image_id}.png`);

    return {
      source: this.source,
      sourceId: String(game.id),
      title: game.name,
      alternateTitles:
        game.slug && game.slug !== game.name.toLowerCase().replace(/\s+/g, '-')
          ? [game.slug.replace(/-/g, ' ')]
          : undefined,
      platforms,
      developers: developers.length > 0 ? developers : undefined,
      publishers: publishers.length > 0 ? publishers : undefined,
      genres: genres.length > 0 ? genres : undefined,
      releaseDate,
      description: game.summary,
      coverUrls: coverUrl
        ? [coverUrl, ...screenshotUrls]
        : screenshotUrls.length > 0
          ? screenshotUrls
          : undefined,
      externalIdentifiers: [{ source: 'igdb', id: String(game.id) }],
      classificationHints: [
        {
          category: 'GAME',
          confidence: 0.85,
          evidence: `IGDB main game (category=0)`,
        },
      ],
      metadata: {
        igdbId: game.id,
        slug: game.slug,
        themes: game.themes,
        igdbUrl: game.url,
      },
    };
  }

  private unixToDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
