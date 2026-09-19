import type { RawCandidate } from './raw-candidate.js';

export interface CatalogPageOptions {
  /** Page size. Provider-enforced maximum applies (IGDB: 500). */
  readonly limit: number;
  /** Zero-based offset. The only checkpoint primitive. */
  readonly offset: number;
}

export interface CatalogPage {
  /**
   * Raw source candidates in provider order. A page shorter than the
   * requested limit (including empty) is the end-of-catalog signal —
   * the future job interprets it, not the adapter.
   */
  readonly items: readonly RawCandidate[];
}

/**
 * Narrow catalog-enumeration capability, separate from SourceAdapter on
 * purpose: enumeration (platform-scoped, deterministic paging) is not
 * text search, and most sources will never implement it.
 */
export interface CatalogSource {
  readonly source: string;

  enumerateByPlatform(
    platformId: number,
    options: CatalogPageOptions,
  ): Promise<CatalogPage>;

  countByPlatform(platformId: number): Promise<number>;
}
