/**
 * Curated IGDB platform allowlist for catalog sync (ratified curation list).
 *
 * Source: team-curated platform table (94 rows as provided). Each entry maps
 * a curated name to a verified IGDB platform ID. Resolution evidence:
 * IGDB /platforms search + full /platforms catalog cross-check +
 * countByPlatform proximity for ambiguous cases (see notes).
 *
 * Statuses: RESOLVED (verified ID) | AMBIGUOUS (ID present but curation
 * caveat, or no ID - sync blocked without an ID) | MISSING (no IGDB
 * platform exists - sync blocked). Entries without an igdbId can never
 * sync; the CLI rejects them with PLATFORM_NOT_ALLOWED.
 */

export type AllowlistMatchStatus = 'RESOLVED' | 'AMBIGUOUS' | 'MISSING';

export interface AllowlistedPlatform {
  readonly curatedName: string;
  readonly curatedCount: number;
  readonly igdbId: number | null;
  readonly igdbName: string | null;
  readonly status: AllowlistMatchStatus;
  readonly note?: string;
}

export const IGDB_PLATFORM_ALLOWLIST: readonly AllowlistedPlatform[] = [
  {
    curatedName: '3DO',
    curatedCount: 256,
    igdbId: 50,
    igdbName: '3DO Interactive Multiplayer',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Android',
    curatedCount: 14076,
    igdbId: 34,
    igdbName: 'Android',
    status: 'RESOLVED',
  },
  { curatedName: 'Arcade', curatedCount: 3653, igdbId: 52, igdbName: 'Arcade', status: 'RESOLVED' },
  {
    curatedName: 'Atari 2600',
    curatedCount: 676,
    igdbId: 59,
    igdbName: 'Atari 2600',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Atari 5200',
    curatedCount: 95,
    igdbId: 66,
    igdbName: 'Atari 5200',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Atari 7800',
    curatedCount: 86,
    igdbId: 60,
    igdbName: 'Atari 7800',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Atari 8-bit',
    curatedCount: 2229,
    igdbId: 65,
    igdbName: 'Atari 8-bit',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Atari ST',
    curatedCount: 2527,
    igdbId: 63,
    igdbName: 'Atari ST/STE',
    status: 'RESOLVED',
  },
  { curatedName: 'Atari VCS', curatedCount: 106, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'CD-i',
    curatedCount: 217,
    igdbId: 117,
    igdbName: 'Philips CD-i',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Commodore 64',
    curatedCount: 5755,
    igdbId: 15,
    igdbName: 'Commodore C64/128/MAX',
    status: 'RESOLVED',
    note: 'IGDB 15 Commodore C64/128/MAX is narrower than curated C64',
  },
  {
    curatedName: 'Dreamcast',
    curatedCount: 612,
    igdbId: 23,
    igdbName: 'Dreamcast',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Game Boy',
    curatedCount: 890,
    igdbId: 33,
    igdbName: 'Game Boy',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Game Boy Advance',
    curatedCount: 1285,
    igdbId: 24,
    igdbName: 'Game Boy Advance',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Game Boy Color',
    curatedCount: 766,
    igdbId: 22,
    igdbName: 'Game Boy Color',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Game Gear',
    curatedCount: 369,
    igdbId: 35,
    igdbName: 'Sega Game Gear',
    status: 'RESOLVED',
  },
  { curatedName: 'Game Wave', curatedCount: 14, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'GameCube',
    curatedCount: 635,
    igdbId: 21,
    igdbName: 'Nintendo GameCube',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Genesis',
    curatedCount: 1075,
    igdbId: 29,
    igdbName: 'Sega Mega Drive/Genesis',
    status: 'RESOLVED',
    note: 'IGDB 29 Sega Mega Drive/Genesis covers both namings',
  },
  { curatedName: 'Linux', curatedCount: 12738, igdbId: 3, igdbName: 'Linux', status: 'RESOLVED' },
  {
    curatedName: 'Macintosh',
    curatedCount: 23586,
    igdbId: 14,
    igdbName: 'Mac',
    status: 'RESOLVED',
    note: 'IGDB 14 Mac',
  },
  { curatedName: 'MSX', curatedCount: 1501, igdbId: 27, igdbName: 'MSX', status: 'RESOLVED' },
  { curatedName: 'N-Gage', curatedCount: 64, igdbId: 42, igdbName: 'N-Gage', status: 'RESOLVED' },
  {
    curatedName: 'N-Gage (service)',
    curatedCount: 28,
    igdbId: null,
    igdbName: null,
    status: 'MISSING',
  },
  {
    curatedName: 'Neo Geo',
    curatedCount: 131,
    igdbId: 79,
    igdbName: 'Neo Geo MVS',
    status: 'AMBIGUOUS',
    note: 'MVS(79)=121 chosen by count proximity to curated 131; AES(80)=168 is the home-console variant',
  },
  {
    curatedName: 'Neo Geo CD',
    curatedCount: 101,
    igdbId: 136,
    igdbName: 'Neo Geo CD',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Neo Geo Pocket',
    curatedCount: 10,
    igdbId: 119,
    igdbName: 'Neo Geo Pocket',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Neo Geo Pocket Color',
    curatedCount: 76,
    igdbId: 120,
    igdbName: 'Neo Geo Pocket Color',
    status: 'RESOLVED',
  },
  { curatedName: 'Neo Geo X', curatedCount: 7, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'NES',
    curatedCount: 1658,
    igdbId: 18,
    igdbName: 'Nintendo Entertainment System',
    status: 'RESOLVED',
  },
  {
    curatedName: 'New Nintendo 3DS',
    curatedCount: 126,
    igdbId: 137,
    igdbName: 'New Nintendo 3DS',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Nintendo 3DS',
    curatedCount: 1696,
    igdbId: 37,
    igdbName: 'Nintendo 3DS',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Nintendo 64',
    curatedCount: 393,
    igdbId: 4,
    igdbName: 'Nintendo 64',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Nintendo DS',
    curatedCount: 2406,
    igdbId: 20,
    igdbName: 'Nintendo DS',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Nintendo DSi',
    curatedCount: 644,
    igdbId: 159,
    igdbName: 'Nintendo DSi',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Nintendo Switch',
    curatedCount: 13858,
    igdbId: 130,
    igdbName: 'Nintendo Switch',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Nintendo Switch 2',
    curatedCount: 299,
    igdbId: 508,
    igdbName: 'Nintendo Switch 2',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Oculus Go',
    curatedCount: 263,
    igdbId: 387,
    igdbName: 'Oculus Go',
    status: 'RESOLVED',
  },
  {
    curatedName: 'PC Booter',
    curatedCount: 270,
    igdbId: null,
    igdbName: null,
    status: 'AMBIGUOUS',
    note: 'IGDB 13 DOS exists but is not equivalent — curation decision required',
  },
  {
    curatedName: 'PC-6001',
    curatedCount: 149,
    igdbId: 157,
    igdbName: 'NEC PC-6000 Series',
    status: 'RESOLVED',
  },
  { curatedName: 'PC-8000', curatedCount: 150, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'PC-88',
    curatedCount: 690,
    igdbId: 125,
    igdbName: 'PC-8800 Series',
    status: 'RESOLVED',
  },
  {
    curatedName: 'PC-98',
    curatedCount: 1448,
    igdbId: 149,
    igdbName: 'PC-9800 Series',
    status: 'RESOLVED',
  },
  { curatedName: 'PC-FX', curatedCount: 62, igdbId: 274, igdbName: 'PC-FX', status: 'RESOLVED' },
  {
    curatedName: 'PICO',
    curatedCount: 36,
    igdbId: null,
    igdbName: null,
    status: 'AMBIGUOUS',
    note: 'Candidates Sega Pico(339)/Advanced Pico Beena(507) predate curated startYear 2022 — curation decision required',
  },
  {
    curatedName: 'PlayStation',
    curatedCount: 3253,
    igdbId: 7,
    igdbName: 'PlayStation',
    status: 'RESOLVED',
  },
  {
    curatedName: 'PlayStation 2',
    curatedCount: 3535,
    igdbId: 8,
    igdbName: 'PlayStation 2',
    status: 'RESOLVED',
  },
  {
    curatedName: 'PlayStation 3',
    curatedCount: 5174,
    igdbId: 9,
    igdbName: 'PlayStation 3',
    status: 'RESOLVED',
  },
  {
    curatedName: 'PlayStation 4',
    curatedCount: 12190,
    igdbId: 48,
    igdbName: 'PlayStation 4',
    status: 'RESOLVED',
  },
  {
    curatedName: 'PlayStation 5',
    curatedCount: 4848,
    igdbId: 167,
    igdbName: 'PlayStation 5',
    status: 'RESOLVED',
  },
  {
    curatedName: 'PlayStation Now',
    curatedCount: 126,
    igdbId: null,
    igdbName: null,
    status: 'MISSING',
  },
  { curatedName: 'Plex Arcade', curatedCount: 27, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'Pokemon Mini',
    curatedCount: 10,
    igdbId: 166,
    igdbName: 'Pokémon mini',
    status: 'RESOLVED',
  },
  {
    curatedName: 'PS Vita',
    curatedCount: 2630,
    igdbId: 46,
    igdbName: 'PlayStation Vita',
    status: 'RESOLVED',
  },
  {
    curatedName: 'PSP',
    curatedCount: 2327,
    igdbId: 38,
    igdbName: 'PlayStation Portable',
    status: 'RESOLVED',
  },
  {
    curatedName: 'SEGA 32X',
    curatedCount: 41,
    igdbId: 30,
    igdbName: 'Sega 32X',
    status: 'RESOLVED',
  },
  {
    curatedName: 'SEGA CD',
    curatedCount: 216,
    igdbId: 78,
    igdbName: 'Sega CD',
    status: 'RESOLVED',
  },
  {
    curatedName: 'SEGA Master System',
    curatedCount: 360,
    igdbId: 64,
    igdbName: 'Sega Master System/Mark III',
    status: 'RESOLVED',
  },
  {
    curatedName: 'SEGA Pico',
    curatedCount: 30,
    igdbId: 339,
    igdbName: 'Sega Pico',
    status: 'RESOLVED',
  },
  {
    curatedName: 'SEGA Saturn',
    curatedCount: 1161,
    igdbId: 32,
    igdbName: 'Sega Saturn',
    status: 'RESOLVED',
  },
  {
    curatedName: 'SNES',
    curatedCount: 1335,
    igdbId: 19,
    igdbName: 'Super Nintendo Entertainment System',
    status: 'RESOLVED',
  },
  { curatedName: 'Solaris', curatedCount: 3, igdbId: null, igdbName: null, status: 'MISSING' },
  { curatedName: 'Sord M5', curatedCount: 25, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'Stadia',
    curatedCount: 307,
    igdbId: 170,
    igdbName: 'Google Stadia',
    status: 'RESOLVED',
  },
  { curatedName: 'Symbian', curatedCount: 463, igdbId: null, igdbName: null, status: 'MISSING' },
  { curatedName: 'Terminal', curatedCount: 507, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'TurboGrafx CD',
    curatedCount: 419,
    igdbId: 150,
    igdbName: 'Turbografx-16/PC Engine CD',
    status: 'RESOLVED',
  },
  {
    curatedName: 'TurboGrafx-16',
    curatedCount: 308,
    igdbId: 86,
    igdbName: 'TurboGrafx-16/PC Engine',
    status: 'RESOLVED',
  },
  { curatedName: 'tvOS', curatedCount: 641, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'VIC-20',
    curatedCount: 968,
    igdbId: 71,
    igdbName: 'Commodore VIC-20',
    status: 'RESOLVED',
  },
  { curatedName: 'VideoBrain', curatedCount: 11, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'Virtual Boy',
    curatedCount: 28,
    igdbId: 87,
    igdbName: 'Virtual Boy',
    status: 'RESOLVED',
  },
  { curatedName: 'VIS', curatedCount: 8, igdbId: null, igdbName: null, status: 'MISSING' },
  { curatedName: 'watchOS', curatedCount: 30, igdbId: null, igdbName: null, status: 'MISSING' },
  { curatedName: 'webOS', curatedCount: 79, igdbId: null, igdbName: null, status: 'MISSING' },
  { curatedName: 'Wii', curatedCount: 2635, igdbId: 5, igdbName: 'Wii', status: 'RESOLVED' },
  { curatedName: 'Wii U', curatedCount: 1391, igdbId: 41, igdbName: 'Wii U', status: 'RESOLVED' },
  {
    curatedName: 'Windows',
    curatedCount: 84808,
    igdbId: 6,
    igdbName: 'PC (Microsoft Windows)',
    status: 'RESOLVED',
    note: 'IGDB 6 PC (Microsoft Windows); IGDB count (~207k) far exceeds curated 84,808',
  },
  {
    curatedName: 'Windows 16-bit',
    curatedCount: 2282,
    igdbId: null,
    igdbName: null,
    status: 'MISSING',
  },
  {
    curatedName: 'Windows Apps',
    curatedCount: 3002,
    igdbId: null,
    igdbName: null,
    status: 'MISSING',
  },
  {
    curatedName: 'Windows Mobile',
    curatedCount: 347,
    igdbId: 405,
    igdbName: 'Windows Mobile',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Windows Phone',
    curatedCount: 867,
    igdbId: 74,
    igdbName: 'Windows Phone',
    status: 'RESOLVED',
  },
  {
    curatedName: 'WonderSwan',
    curatedCount: 108,
    igdbId: 57,
    igdbName: 'WonderSwan',
    status: 'RESOLVED',
  },
  {
    curatedName: 'WonderSwan Color',
    curatedCount: 50,
    igdbId: 123,
    igdbName: 'WonderSwan Color',
    status: 'RESOLVED',
  },
  { curatedName: 'XaviXPORT', curatedCount: 4, igdbId: null, igdbName: null, status: 'MISSING' },
  { curatedName: 'Xbox', curatedCount: 1068, igdbId: 11, igdbName: 'Xbox', status: 'RESOLVED' },
  {
    curatedName: 'Xbox 360',
    curatedCount: 5008,
    igdbId: 12,
    igdbName: 'Xbox 360',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Xbox One',
    curatedCount: 9141,
    igdbId: 49,
    igdbName: 'Xbox One',
    status: 'RESOLVED',
  },
  {
    curatedName: 'Xbox Series',
    curatedCount: 5112,
    igdbId: 169,
    igdbName: 'Xbox Series X|S',
    status: 'RESOLVED',
  },
  { curatedName: 'Zeebo', curatedCount: 58, igdbId: 240, igdbName: 'Zeebo', status: 'RESOLVED' },
  {
    curatedName: 'ZX Spectrum',
    curatedCount: 3683,
    igdbId: 26,
    igdbName: 'ZX Spectrum',
    status: 'RESOLVED',
  },
  {
    curatedName: 'ZX Spectrum Next',
    curatedCount: 73,
    igdbId: null,
    igdbName: null,
    status: 'MISSING',
  },
  { curatedName: 'ZX80', curatedCount: 15, igdbId: null, igdbName: null, status: 'MISSING' },
  {
    curatedName: 'ZX81',
    curatedCount: 311,
    igdbId: 373,
    igdbName: 'Sinclair ZX81',
    status: 'RESOLVED',
  },
];

/** IGDB IDs allowed to sync (entries with a verified ID). */
export const ALLOWLISTED_PLATFORM_IDS: ReadonlySet<number> = new Set(
  IGDB_PLATFORM_ALLOWLIST.filter((p) => p.igdbId !== null).map((p) => p.igdbId as number),
);

/** Case-insensitive lookup by curated name (trims surrounding whitespace). */
export function findAllowlistedPlatform(name: string): AllowlistedPlatform | undefined {
  const normalized = name.trim().toLowerCase();
  return IGDB_PLATFORM_ALLOWLIST.find((p) => p.curatedName.toLowerCase() === normalized);
}

/** True only for IGDB IDs present in the allowlist with a verified ID. */
export function isAllowedPlatformId(igdbId: number): boolean {
  return ALLOWLISTED_PLATFORM_IDS.has(igdbId);
}

/**
 * Deterministic sync order: smallest curatedCount first (progressive
 * accumulation), ties broken by curatedName. Only entries with an
 * igdbId are returned - MISSING / ID-less entries can never sync.
 */
export function allowlistedPlatformsInSyncOrder(): AllowlistedPlatform[] {
  return IGDB_PLATFORM_ALLOWLIST.filter((p) => p.igdbId !== null).sort(
    (a, b) => a.curatedCount - b.curatedCount || a.curatedName.localeCompare(b.curatedName),
  );
}
