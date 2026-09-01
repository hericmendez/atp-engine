import type { PlatformFamily, PlatformType } from '../shared/platform.js';

export type PlatformStatus = 'active' | 'inactive' | 'discontinued';

export interface PlatformCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly releaseYear: number | null;
  readonly status: PlatformStatus;
  readonly family: PlatformFamily | null;
  readonly type: PlatformType | null;
  readonly thumb: string | null;
}

export function createPlatformCatalogEntry(input: {
  id: string;
  name: string;
  company: string;
  releaseYear?: number | null;
  status?: PlatformStatus;
  family?: PlatformFamily | null;
  type?: PlatformType | null;
  thumb?: string | null;
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

  return {
    id: input.id.trim(),
    name: input.name.trim(),
    company: input.company.trim(),
    releaseYear: input.releaseYear ?? null,
    status: input.status ?? 'active',
    family: input.family ?? null,
    type: input.type ?? null,
    thumb: input.thumb ?? null,
  };
}
