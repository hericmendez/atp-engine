export interface Genre {
  readonly name: string;
}

export function createGenre(name: string): Genre {
  if (!name || name.trim().length === 0) {
    throw new Error('Genre name must not be empty');
  }
  return { name: name.trim() };
}

export function genreEquals(a: Genre, b: Genre): boolean {
  return a.name === b.name;
}
