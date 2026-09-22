import { BaseAdapter, type BaseAdapterConfig } from '../base-adapter.js';
import type { SearchOptions, SearchResult } from '../source-adapter.js';
import type { CatalogPage, CatalogPageOptions, CatalogSource } from '../catalog-source.js';
import type { RawCandidate } from '../raw-candidate.js';
import { SourceError } from '../source-errors.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { igdbGameStatusName, igdbGameTypeName } from './igdb-game-type.js';
import { IGDB_CANONICAL_GAME_TYPE_IDS } from './igdb-game-type.js';
import type { TokenBucketRateLimiter } from '../../infrastructure/rate-limiter.js';

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
  platforms?: Array<number | { id: number; name?: string }>;
  involved_companies?: number[];
  cover?: { id: string; url: string; image_id?: string };
  screenshots?: Array<{ id: string; url: string; image_id?: string }>;
  themes?: number[];
  game_modes?: number[];
  player_perspectives?: number[];
  storyline?: string;
  url?: string;
  game_type?: number;
  status?: number;
  parent_game?: number;
  version_parent?: number;
}

interface IgdbInvolvement {
  id: number;
  company: number;
  developer: boolean;
  publisher: boolean;
}

// Canonical console IDs below (PS1 7, PS2 8, PS3 9, Xbox 11, Xbox 360 12,
// Xbox One 49, PS5 167, Series X|S 169, N64 4, Wii 5, Dreamcast 23,
// Saturn 32, 3DS 37) were cross-checked against independent public IGDB
// platform dumps. This map is a FALLBACK: the adapter prefers upstream
// expanded `platforms.name` values whenever present (see gameToCandidate).
// Unverified exotic entries are left untouched; do not treat this map as
// authoritative — prefer expansion for new platforms.
const IGDB_PLATFORM_MAP: Record<number, string> = {
  3: 'Linux',
  4: 'Nintendo 64',
  5: 'Wii',
  6: 'PC',
  7: 'PlayStation',
  8: 'PlayStation 2',
  9: 'PlayStation 3',
  11: 'Xbox',
  12: 'Xbox 360',
  13: 'Nintendo DS',
  14: 'Mac',
  18: 'NES',
  19: 'SNES',
  20: 'Nintendo DS',
  21: 'GameCube',
  22: 'Game Boy Advance',
  23: 'Sega Dreamcast',
  24: 'Game Boy',
  32: 'Sega Saturn',
  34: 'Android',
  37: 'Nintendo 3DS',
  38: 'PlayStation Portable',
  39: 'iOS',
  41: 'Wii U',
  48: 'PlayStation 4',
  49: 'Xbox One',
  130: 'Nintendo Switch',
  162: 'Oculus VR',
  163: 'SteamVR',
  167: 'PlayStation 5',
  169: 'Xbox Series X|S',
  29: 'TurboGrafx-16',
  30: 'Sega Master System',
  33: 'Game & Watch',
  35: 'Sega Dreamcast',
  36: 'Sega Saturn',
  42: 'Neo Geo',
  43: 'Commodore C64',
  44: 'Amiga',
  45: 'Atari 2600',
  46: 'Atari 7800',
  47: 'Atari Lynx',
  50: '3DO Interactive Multiplayer',
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

// Shared field list: search, getById and enumeration read the same shape
// so mapping behavior cannot drift between paths.
const IGDB_GAME_FIELDS =
  'name, slug, summary, first_release_date, genres, platforms, platforms.name, involved_companies, cover.image_id, screenshots.image_id, themes, game_type, status, parent_game, version_parent';

// IGDB caps page size at 500.
const MAX_ENUMERATE_LIMIT = 500;

export type IgdbAdapterConfig = Omit<BaseAdapterConfig, 'baseUrl'> & {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly baseUrl?: string;
  /**
   * Explicit request gate: every postApi call acquires a token first,
   * so multi-call flows (getById + involved + companies) share one
   * smooth stream. Absent by default — existing paths/tests keep their
   * behavior; the enrichment CLI wires one explicitly.
   */
  readonly rateLimiter?: TokenBucketRateLimiter;
};

export class IgdbAdapter extends BaseAdapter implements CatalogSource {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly rateLimiter: TokenBucketRateLimiter | undefined;
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
    this.rateLimiter = config.rateLimiter;
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;

    const token = await this.getAccessToken();

    const body = [
      `search "${query.replace(/"/g, '\\"')}";`,
      `fields ${IGDB_GAME_FIELDS};`,
      `limit ${limit};`,
      `offset ${offset};`,
      // Canonically admissible types only (policy B: main_game,
      // standalone_expansion, remake, remaster, expanded_game — see
      // IGDB_CANONICAL_GAME_TYPE_IDS, parity-tested against the
      // eligibility policy's CANONICAL_TYPES). The downstream policy
      // gate remains the admission authority; the query only avoids
      // fetching records that can never be canonical.
      `where game_type = (${IGDB_CANONICAL_GAME_TYPE_IDS.join(',')});`,
    ].join(' ');

    const data = await this.postApi<IgdbGame[]>('/games', body, token);

    const candidates = data.map((game) => this.gameToCandidate(game));

    return {
      candidates,
      totalEstimate: undefined,
      hasMore: data.length === limit,
    };
  }

  /**
   * Minimal platform lookup for allowlist validation (name verification).
   * Returns null for unknown IDs instead of throwing — callers report
   * MISSING. Uses the same token/postApi path as game queries.
   */
  async getPlatformInfo(id: number): Promise<{ id: number; name: string } | null> {
    if (!Number.isInteger(id) || id < 1) {
      return null;
    }
    const token = await this.getAccessToken();
    const data = await this.postApi<{ id: number; name: string }[]>(
      '/platforms',
      `where id = ${id}; fields name;`,
      token,
    );
    if (!data || data.length === 0 || typeof data[0]?.name !== 'string') {
      return null;
    }
    return { id: data[0].id, name: data[0].name };
  }

  async getById(id: string): Promise<RawCandidate | null> {
    const igdbId = parseInt(id, 10);
    if (isNaN(igdbId)) {
      return null;
    }

    const token = await this.getAccessToken();

    const body = [`where id = ${igdbId};`, `fields ${IGDB_GAME_FIELDS};`].join(' ');

    const data = await this.postApi<IgdbGame[]>('/games', body, token);

    if (!data || data.length === 0) {
      return null;
    }

    const game = data[0];

    // Fetch company details if available
    if (game.involved_companies && game.involved_companies.length > 0) {
      const companies = await this.fetchCompanyRoles(game.involved_companies, token);
      return this.gameToCandidate(game, companies);
    }

    return this.gameToCandidate(game);
  }

  private platformPredicate(platformId: number): string {
    return `where platforms = (${platformId});`;
  }

  /**
   * One deterministic page of a platform catalog. No text-search clause
   * (this is enumeration, not search), no category filter (ports and
   * remakes are separate IGDB entries the future job must see), stable
   * `sort id asc` ordering. Company details are intentionally NOT fetched
   * per game here — that is N+1 work for the ingestion job, which resolves
   * companies only for accepted records.
   */
  async enumerateByPlatform(platformId: number, options: CatalogPageOptions): Promise<CatalogPage> {
    if (!Number.isInteger(platformId) || platformId <= 0) {
      throw new Error(
        `IgdbAdapter.enumerateByPlatform: platformId must be a positive integer (got ${platformId})`,
      );
    }
    if (
      !Number.isInteger(options.limit) ||
      options.limit < 1 ||
      options.limit > MAX_ENUMERATE_LIMIT
    ) {
      throw new Error(
        `IgdbAdapter.enumerateByPlatform: limit must be an integer between 1 and ${MAX_ENUMERATE_LIMIT} (got ${options.limit})`,
      );
    }
    if (!Number.isInteger(options.offset) || options.offset < 0) {
      throw new Error(
        `IgdbAdapter.enumerateByPlatform: offset must be a non-negative integer (got ${options.offset})`,
      );
    }

    const token = await this.getAccessToken();

    const body = [
      this.platformPredicate(platformId),
      `fields ${IGDB_GAME_FIELDS};`,
      `limit ${options.limit};`,
      `offset ${options.offset};`,
      'sort id asc;',
    ].join(' ');

    const data = await this.postApi<IgdbGame[]>('/games', body, token);

    return {
      items: data.map((game) => this.gameToCandidate(game)),
    };
  }

  /**
   * Total matching a platform scope, using the same predicate as
   * enumerateByPlatform. Pure read: no persistence, discovery,
   * eligibility, or quarantine involved.
   */
  async countByPlatform(platformId: number): Promise<number> {
    if (!Number.isInteger(platformId) || platformId <= 0) {
      throw new Error(
        `IgdbAdapter.countByPlatform: platformId must be a positive integer (got ${platformId})`,
      );
    }

    const token = await this.getAccessToken();

    const body = [this.platformPredicate(platformId)].join(' ');

    const data = await this.postApi<{ count: number }>('/games/count', body, token);

    if (!data || typeof data.count !== 'number') {
      throw new SourceError(
        this.source,
        'invalid_response',
        'IGDB count endpoint returned an unexpected shape',
      );
    }

    return data.count;
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
    await this.rateLimiter?.acquire();
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

  private async fetchCompanyRoles(
    involvementIds: number[],
    token: string,
  ): Promise<Array<{ name: string; developer: boolean; publisher: boolean }>> {
    if (involvementIds.length === 0) {
      return [];
    }

    try {
      // involved_companies IDs are involvement records, not companies:
      // resolve true roles first, then names. Any failure degrades to
      // no company data rather than fabricated roles.
      const involvements = await this.postApi<IgdbInvolvement[]>(
        '/involved_companies',
        [`where id = (${involvementIds.join(',')});`, 'fields company,developer,publisher;'].join(
          ' ',
        ),
        token,
      );

      const rolesByCompany = new Map<number, { developer: boolean; publisher: boolean }>();
      for (const involvement of involvements) {
        const current = rolesByCompany.get(involvement.company) ?? {
          developer: false,
          publisher: false,
        };
        current.developer = current.developer || involvement.developer === true;
        current.publisher = current.publisher || involvement.publisher === true;
        rolesByCompany.set(involvement.company, current);
      }

      const companyIds = [...rolesByCompany.keys()];
      if (companyIds.length === 0) {
        return [];
      }

      const companies = await this.postApi<Array<{ id: number; name: string }>>(
        '/companies',
        [`where id = (${companyIds.join(',')});`, 'fields name;'].join(' '),
        token,
      );

      const names = new Map(companies.map((c) => [c.id, c.name]));
      const result: Array<{ name: string; developer: boolean; publisher: boolean }> = [];
      for (const [companyId, roles] of rolesByCompany) {
        const name = names.get(companyId);
        if (name !== undefined) {
          result.push({ name, ...roles });
        }
      }
      return result;
    } catch {
      return [];
    }
  }

  private gameToCandidate(
    game: IgdbGame,
    companies?: Array<{ name: string; developer: boolean; publisher: boolean }>,
  ): RawCandidate {
    // Prefer authoritative upstream platform names from expansion; the
    // static map is only a fallback for bare numeric IDs. An expanded
    // name is never collapsed (e.g. PlayStation 2 stays PlayStation 2).
    // The numeric provider id travels alongside its name so downstream
    // stages can record an exact external identity. Entries without a
    // usable name are dropped entirely — no identifier is invented.
    const platforms = (game.platforms ?? [])
      .map((platform) => {
        if (typeof platform === 'object' && platform !== null) {
          const name = platform.name?.trim();
          return name && name.length > 0
            ? { name, source: 'igdb', sourceId: platform.id }
            : undefined;
        }
        const name = IGDB_PLATFORM_MAP[platform];
        return name && name.length > 0 ? { name, source: 'igdb', sourceId: platform } : undefined;
      })
      .filter(
        (entry): entry is { name: string; source: string; sourceId: number } => entry !== undefined,
      );

    const genres = (game.genres ?? [])
      .map((id) => IGDB_GENRE_MAP[id])
      .filter((name): name is string => Boolean(name));

    const developers = (companies ?? []).filter((c) => c.developer).map((c) => c.name);

    const publishers = (companies ?? []).filter((c) => c.publisher).map((c) => c.name);

    const releaseDate = game.first_release_date ? this.unixToDate(game.first_release_date) : null;

    const gameType = igdbGameTypeName(game.game_type ?? null);
    const gameStatus = igdbGameStatusName(game.status ?? null);
    const parentGameId =
      game.parent_game === undefined || game.parent_game === null
        ? undefined
        : String(game.parent_game);
    const versionParentId =
      game.version_parent === undefined || game.version_parent === null
        ? undefined
        : String(game.version_parent);

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
      gameType,
      gameStatus,
      parentGameId,
      versionParentId,
      classificationHints: [
        {
          category: 'GAME',
          confidence: 0.85,
          evidence: `IGDB game (game_type=${game.game_type ?? 'unknown'})`,
        },
      ],
      metadata: {
        igdbId: game.id,
        slug: game.slug,
        themes: game.themes,
        igdbUrl: game.url,
        igdbGameType: game.game_type,
        igdbGameStatus: game.status,
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
