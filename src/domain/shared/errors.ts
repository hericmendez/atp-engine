export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class InvalidGameError extends DomainError {
  constructor(message: string) {
    super('INVALID_GAME', message);
    this.name = 'InvalidGameError';
  }
}

export class InvalidReleaseError extends DomainError {
  constructor(message: string) {
    super('INVALID_RELEASE', message);
    this.name = 'InvalidReleaseError';
  }
}

export class InvalidRelationshipError extends DomainError {
  constructor(message: string) {
    super('INVALID_RELATIONSHIP', message);
    this.name = 'InvalidRelationshipError';
  }
}
