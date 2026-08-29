import type { PlatformFamily, PlatformType } from '../domain/shared/platform.js';

const PLATFORM_ALIASES: Record<string, string> = {
  // Sony PlayStation
  ps1: 'PlayStation',
  psx: 'PlayStation',
  playstation1: 'PlayStation',
  'playstation 1': 'PlayStation',
  ps2: 'PlayStation 2',
  playstation2: 'PlayStation 2',
  'playstation 2': 'PlayStation 2',
  ps3: 'PlayStation 3',
  playstation3: 'PlayStation 3',
  'playstation 3': 'PlayStation 3',
  ps4: 'PlayStation 4',
  playstation4: 'PlayStation 4',
  'playstation 4': 'PlayStation 4',
  ps5: 'PlayStation 5',
  playstation5: 'PlayStation 5',
  'playstation 5': 'PlayStation 5',
  psp: 'PlayStation Portable',
  'playstation portable': 'PlayStation Portable',
  'ps vita': 'PlayStation Vita',
  'playstation vita': 'PlayStation Vita',
  vita: 'PlayStation Vita',

  // Nintendo
  nes: 'Nintendo Entertainment System',
  'nintendo entertainment system': 'Nintendo Entertainment System',
  snes: 'Super Nintendo Entertainment System',
  'super nintendo': 'Super Nintendo Entertainment System',
  'super nintendo entertainment system': 'Super Nintendo Entertainment System',
  n64: 'Nintendo 64',
  'nintendo 64': 'Nintendo 64',
  nintendo64: 'Nintendo 64',
  gc: 'GameCube',
  gamecube: 'GameCube',
  'nintendo gamecube': 'GameCube',
  gba: 'Game Boy Advance',
  'game boy advance': 'Game Boy Advance',
  'gameboy advance': 'Game Boy Advance',
  gbc: 'Game Boy Color',
  'game boy color': 'Game Boy Color',
  'gameboy color': 'Game Boy Color',
  gb: 'Game Boy',
  'game boy': 'Game Boy',
  gameboy: 'Game Boy',
  ds: 'Nintendo DS',
  'nintendo ds': 'Nintendo DS',
  '3ds': 'Nintendo 3DS',
  'nintendo 3ds': 'Nintendo 3DS',
  '2ds': 'Nintendo 2DS',
  wii: 'Wii',
  'wii u': 'Wii U',
  wiiu: 'Wii U',
  switch: 'Nintendo Switch',
  'nintendo switch': 'Nintendo Switch',
  'oled model': 'Nintendo Switch',

  // Microsoft Xbox
  xbox: 'Xbox',
  'xbox original': 'Xbox',
  'original xbox': 'Xbox',
  xbox360: 'Xbox 360',
  'xbox 360': 'Xbox 360',
  xboxone: 'Xbox One',
  'xbox one': 'Xbox One',
  'xbox one s': 'Xbox One S',
  'xbox one x': 'Xbox One X',
  xsx: 'Xbox Series X',
  'xbox series x': 'Xbox Series X',
  'series x': 'Xbox Series X',
  xss: 'Xbox Series S',
  'xbox series s': 'Xbox Series S',
  'series s': 'Xbox Series S',
  'xbox series': 'Xbox Series',

  // PC
  pc: 'PC',
  win: 'Windows',
  windows: 'Windows',
  mac: 'macOS',
  macos: 'macOS',
  linux: 'Linux',
  dos: 'MS-DOS',
  'ms-dos': 'MS-DOS',
  msdos: 'MS-DOS',

  // Mobile
  ios: 'iOS',
  android: 'Android',
  mobile: 'Mobile',
  windowsphone: 'Windows Phone',
  'windows phone': 'Windows Phone',

  // Sega
  genesis: 'Sega Genesis',
  'mega drive': 'Sega Genesis',
  saturn: 'Sega Saturn',
  dreamcast: 'Sega Dreamcast',
  'game gear': 'Sega Game Gear',

  // Atari
  atari2600: 'Atari 2600',
  'atari 2600': 'Atari 2600',
  atari7800: 'Atari 7800',
  'atari 7800': 'Atari 7800',
  jaguar: 'Atari Jaguar',
  lynx: 'Atari Lynx',

  // Retro computers
  c64: 'Commodore 64',
  'commodore 64': 'Commodore 64',
  amiga: 'Amiga',
  msx: 'MSX',
  zx: 'ZX Spectrum',
  'zx spectrum': 'ZX Spectrum',
  'apple ii': 'Apple II',
  'sharp x68000': 'Sharp X68000',
  'pc-98': 'PC-98',
  'atari st': 'Atari ST',

  // Arcade
  arcade: 'Arcade',
  cps1: 'CPS1',
  cps2: 'CPS2',
  cps3: 'CPS3',
  'neo geo': 'Neo Geo',
  neo: 'Neo Geo',
  'neo geo pocket': 'Neo Geo Pocket',
  naomi: 'Naomi',
  atomiswave: 'Atomiswave',

  // Fantasy consoles
  'pico-8': 'PICO-8',
  pico8: 'PICO-8',
  'tic-80': 'TIC-80',
  tic80: 'TIC-80',
  'wasm-4': 'WASM-4',
  wasm4: 'WASM-4',
  'lowres nx': 'LowRes NX',
  vircon32: 'Vircon32',

  // Other
  'virtual boy': 'Virtual Boy',
  'oculus quest': 'Meta Quest',
  'meta quest': 'Meta Quest',
  quest: 'Meta Quest',
  vr: 'VR',
} as const;

const PLATFORM_FAMILIES: Record<string, PlatformFamily> = {
  // PC family
  pc: 'PC',
  windows: 'PC',
  macos: 'PC',
  linux: 'PC',
  'ms-dos': 'PC',
  'commodore 64': 'Other',
  amiga: 'Other',
  msx: 'Other',
  'zx spectrum': 'Other',
  'apple ii': 'Other',
  'sharp x68000': 'Other',
  'pc-98': 'Other',
  'atari st': 'Other',

  // PlayStation family
  playstation: 'PlayStation',
  'playstation 2': 'PlayStation',
  'playstation 3': 'PlayStation',
  'playstation 4': 'PlayStation',
  'playstation 5': 'PlayStation',
  'playstation portable': 'PlayStation',
  'playstation vita': 'PlayStation',

  // Xbox family
  xbox: 'Xbox',
  'xbox 360': 'Xbox',
  'xbox one': 'Xbox',
  'xbox one s': 'Xbox',
  'xbox one x': 'Xbox',
  'xbox series x': 'Xbox',
  'xbox series s': 'Xbox',
  'xbox series': 'Xbox',

  // Nintendo family
  'nintendo entertainment system': 'Nintendo',
  'super nintendo entertainment system': 'Nintendo',
  'nintendo 64': 'Nintendo',
  gamecube: 'Nintendo',
  'game boy': 'Nintendo',
  'game boy color': 'Nintendo',
  'game boy advance': 'Nintendo',
  'nintendo ds': 'Nintendo',
  'nintendo 3ds': 'Nintendo',
  'nintendo 2ds': 'Nintendo',
  wii: 'Nintendo',
  'wii u': 'Nintendo',
  'nintendo switch': 'Nintendo',

  // Sega family
  'sega genesis': 'Sega',
  'sega saturn': 'Sega',
  'sega dreamcast': 'Sega',
  'sega game gear': 'Sega',

  // Atari family
  'atari 2600': 'Atari',
  'atari 7800': 'Atari',
  'atari jaguar': 'Atari',
  'atari lynx': 'Atari',

  // Mobile family
  mobile: 'Mobile',
  ios: 'Mobile',
  android: 'Mobile',
  'windows phone': 'Mobile',

  // Arcade
  arcade: 'Other',
  cps1: 'Other',
  cps2: 'Other',
  cps3: 'Other',
  'neo geo': 'Other',
  'neo geo pocket': 'Other',
  naomi: 'Other',
  atomiswave: 'Other',

  // Fantasy consoles
  'pico-8': 'Other',
  'tic-80': 'Other',
  'wasm-4': 'Other',
  'lowres nx': 'Other',
  vircon32: 'Other',
} as const;

const PLATFORM_TYPES: Record<string, PlatformType> = {
  // Consoles
  playstation: 'console',
  'playstation 2': 'console',
  'playstation 3': 'console',
  'playstation 4': 'console',
  'playstation 5': 'console',
  xbox: 'console',
  'xbox 360': 'console',
  'xbox one': 'console',
  'xbox series x': 'console',
  'xbox series s': 'console',
  'nintendo entertainment system': 'console',
  'super nintendo entertainment system': 'console',
  'nintendo 64': 'console',
  gamecube: 'console',
  wii: 'console',
  'wii u': 'console',
  'nintendo switch': 'console',
  'sega genesis': 'console',
  'sega saturn': 'console',
  'sega dreamcast': 'console',
  'atari 2600': 'console',
  'atari 7800': 'console',
  'atari jaguar': 'console',
  'virtual boy': 'console',

  // Handhelds
  'playstation portable': 'handheld',
  'playstation vita': 'handheld',
  'game boy': 'handheld',
  'game boy color': 'handheld',
  'game boy advance': 'handheld',
  'nintendo ds': 'handheld',
  'nintendo 3ds': 'handheld',
  'nintendo 2ds': 'handheld',
  'sega game gear': 'handheld',
  'atari lynx': 'handheld',
  'neo geo pocket': 'handheld',

  // Computers
  pc: 'computer',
  windows: 'computer',
  macos: 'computer',
  linux: 'computer',
  'ms-dos': 'computer',
  'commodore 64': 'computer',
  amiga: 'computer',
  msx: 'computer',
  'zx spectrum': 'computer',
  'apple ii': 'computer',
  'sharp x68000': 'computer',
  'pc-98': 'computer',
  'atari st': 'computer',

  // Mobile
  android: 'mobile',
  ios: 'mobile',
  'windows phone': 'mobile',

  // Arcade
  arcade: 'arcade',
  cps1: 'arcade',
  cps2: 'arcade',
  cps3: 'arcade',
  'neo geo': 'arcade',
  naomi: 'arcade',
  atomiswave: 'arcade',

  // Fantasy consoles
  'pico-8': 'fantasy-console',
  'tic-80': 'fantasy-console',
  'wasm-4': 'fantasy-console',
  'lowres nx': 'fantasy-console',
  vircon32: 'fantasy-console',
} as const;

export function resolvePlatformAlias(input: string): string {
  const normalized = input.trim().toLowerCase();
  return PLATFORM_ALIASES[normalized] ?? input.trim();
}

export function resolvePlatformFamily(input: string): PlatformFamily | null {
  const normalized = input.trim().toLowerCase();
  const resolved = (PLATFORM_ALIASES[normalized] ?? normalized).toLowerCase();
  return PLATFORM_FAMILIES[resolved] ?? null;
}

export function resolvePlatformType(input: string): PlatformType {
  const normalized = input.trim().toLowerCase();
  const resolved = (PLATFORM_ALIASES[normalized] ?? normalized).toLowerCase();
  return PLATFORM_TYPES[resolved] ?? 'other';
}
