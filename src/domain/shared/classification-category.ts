export const ClassificationCategory = {
  GAME: 'GAME',
  DLC: 'DLC',
  EXPANSION: 'EXPANSION',
  MOVIE: 'MOVIE',
  TV_SHOW: 'TV_SHOW',
  ANIME: 'ANIME',
  SOUNDTRACK: 'SOUNDTRACK',
  BOOK: 'BOOK',
  HARDWARE: 'HARDWARE',
  PROMOTIONAL: 'PROMOTIONAL',
  CHARACTER: 'CHARACTER',
  FRANCHISE: 'FRANCHISE',
  PERSON: 'PERSON',
  EVENT: 'EVENT',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ClassificationCategory =
  (typeof ClassificationCategory)[keyof typeof ClassificationCategory];

export const GAME_LIKE_CATEGORIES: readonly ClassificationCategory[] = [
  ClassificationCategory.GAME,
  ClassificationCategory.DLC,
  ClassificationCategory.EXPANSION,
] as const;
