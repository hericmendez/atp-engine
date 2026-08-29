export type TitleType = 'primary' | 'alternate' | 'localized' | 'abbreviated';

export interface GameTitle {
  readonly value: string;
  readonly type: TitleType;
}

export function createGameTitle(value: string, type: TitleType = 'primary'): GameTitle {
  if (!value || value.trim().length === 0) {
    throw new Error('Title value must not be empty');
  }
  return { value: value.trim(), type };
}

export function gameTitleEquals(a: GameTitle, b: GameTitle): boolean {
  return a.value === b.value && a.type === b.type;
}
