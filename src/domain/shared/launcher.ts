export interface Launcher {
  readonly name: string;
}

export function createLauncher(name: string): Launcher {
  if (!name || name.trim().length === 0) {
    throw new Error('Launcher name must not be empty');
  }
  return { name: name.trim() };
}

export function launcherEquals(a: Launcher, b: Launcher): boolean {
  return a.name === b.name;
}
