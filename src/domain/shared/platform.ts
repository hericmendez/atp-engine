export type PlatformFamily =
  'PC' | 'PlayStation' | 'Xbox' | 'Nintendo' | 'Sega' | 'Atari' | 'Mobile' | 'Other';

export type PlatformType =
  'console' | 'handheld' | 'arcade' | 'computer' | 'mobile' | 'web' | 'fantasy-console' | 'other';

export interface Platform {
  readonly name: string;
  readonly family: PlatformFamily | null;
  readonly type: PlatformType;
}

export function createPlatform(
  name: string,
  family?: PlatformFamily,
  type?: PlatformType,
): Platform {
  if (!name || name.trim().length === 0) {
    throw new Error('Platform name must not be empty');
  }
  return {
    name: name.trim(),
    family: family ?? null,
    type: type ?? 'other',
  };
}

export function platformEquals(a: Platform, b: Platform): boolean {
  return a.name === b.name;
}
