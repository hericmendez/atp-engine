export interface ExternalIdentifier {
  readonly source: string;
  readonly id: string;
}

export function createExternalIdentifier(source: string, id: string): ExternalIdentifier {
  if (!source || source.trim().length === 0) {
    throw new Error('ExternalIdentifier source must not be empty');
  }
  if (!id || id.trim().length === 0) {
    throw new Error('ExternalIdentifier id must not be empty');
  }
  return { source: source.trim(), id: id.trim() };
}

export function externalIdentifierEquals(a: ExternalIdentifier, b: ExternalIdentifier): boolean {
  return a.source === b.source && a.id === b.id;
}
