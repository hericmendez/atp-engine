export interface Region {
  readonly name: string;
}

export function createRegion(name: string): Region {
  if (!name || name.trim().length === 0) {
    throw new Error('Region name must not be empty');
  }
  return { name: name.trim() };
}

export function regionEquals(a: Region, b: Region): boolean {
  return a.name === b.name;
}
