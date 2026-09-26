import type { PlatformFamily, PlatformType } from '../shared/platform.js';

export type PlatformStatus = 'active' | 'inactive' | 'discontinued';

export interface PlatformThumb {
  readonly logo: string | null;
  readonly image: string | null;
}

export interface PlatformCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly releaseYear: number | null;
  readonly status: PlatformStatus;
  readonly family: PlatformFamily | null;
  readonly type: PlatformType | null;
  readonly thumb: PlatformThumb | null;
}

export function createPlatformCatalogEntry(input: {
  id: string;
  name: string;
  company: string;
  releaseYear?: number | null;
  status?: PlatformStatus;
  family?: PlatformFamily | null;
  type?: PlatformType | null;
  thumb?: PlatformThumb | string | null;
}): PlatformCatalogEntry {
  if (!input.id || input.id.trim().length === 0) {
    throw new Error('Platform catalog entry ID must not be empty');
  }
  if (!input.name || input.name.trim().length === 0) {
    throw new Error('Platform catalog entry name must not be empty');
  }
  if (!input.company || input.company.trim().length === 0) {
    throw new Error('Platform catalog entry company must not be empty');
  }

  let thumb: PlatformThumb | null = null;
  if (typeof input.thumb === 'string') {
    thumb = { logo: input.thumb, image: null };
  } else if (input.thumb && typeof input.thumb === 'object') {
    const logo = (input.thumb as PlatformThumb).logo ?? null;
    const image = (input.thumb as PlatformThumb).image ?? null;
    if (logo || image) thumb = { logo: logo ?? null, image: image ?? null };
    else thumb = null;
  } else {
    thumb = null;
  }

  return {
    id: input.id.trim(),
    name: input.name.trim(),
    company: input.company.trim(),
    releaseYear: input.releaseYear ?? null,
    status: input.status ?? 'active',
    family: input.family ?? null,
    type: input.type ?? null,
    thumb,
  };
}

export function getPlatformThumbStatus(thumb: PlatformThumb | null): 'NOT_FOUND' | 'FOUND_PARTIAL' | 'FOUND_COMPLETE' {
  const hasLogo = !!thumb?.logo;
  const hasImage = !!thumb?.image;
  if (hasLogo && hasImage) return 'FOUND_COMPLETE';
  if (hasLogo || hasImage) return 'FOUND_PARTIAL';
  return 'NOT_FOUND';
}
