export type DataOrigin = 'database' | 'scraper';

export interface DatabaseResult<T> {
  readonly data: T;
  readonly origin: 'database';
}

export interface ScraperResult<T> {
  readonly data: T;
  readonly origin: 'scraper';
}

export type OriginResult<T> = DatabaseResult<T> | ScraperResult<T>;
