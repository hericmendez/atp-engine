export type PlatformFamily =
  'PC' | 'PlayStation' | 'Xbox' | 'Nintendo' | 'Sega' | 'Atari' | 'Mobile' | 'Other';

export interface Platform {
  readonly name: string;
  readonly family: PlatformFamily | null;
}

export function createPlatform(name: string, family?: PlatformFamily): Platform {
  if (!name || name.trim().length === 0) {
    throw new Error('Platform name must not be empty');
  }
  return { name: name.trim(), family: family ?? null };
}

export function platformEquals(a: Platform, b: Platform): boolean {
  return a.name === b.name;
}
