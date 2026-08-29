declare const __brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type GameId = Brand<string, 'GameId'>;
export type ReleaseId = Brand<string, 'ReleaseId'>;

export function createGameId(value: string): GameId {
  if (!value || value.trim().length === 0) {
    throw new Error('GameId must not be empty');
  }
  return value as GameId;
}

export function createReleaseId(value: string): ReleaseId {
  if (!value || value.trim().length === 0) {
    throw new Error('ReleaseId must not be empty');
  }
  return value as ReleaseId;
}
