export const IdentityOutcome = {
  SAME_GAME: 'SAME_GAME',
  DIFFERENT_GAME: 'DIFFERENT_GAME',
  RELATED_GAME: 'RELATED_GAME',
  UNRESOLVED: 'UNRESOLVED',
} as const;

export type IdentityOutcome = (typeof IdentityOutcome)[keyof typeof IdentityOutcome];
