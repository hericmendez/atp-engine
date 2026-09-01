export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, 404);
    this.name = 'NotFoundError';
  }
}

export class SourceError extends AppError {
  constructor(source: string, message: string, details?: unknown) {
    super('SOURCE_ERROR', `Source ${source}: ${message}`, 502, details);
    this.name = 'SourceError';
  }
}

export class PersistenceError extends AppError {
  constructor(message: string, details?: unknown) {
    super('PERSISTENCE_ERROR', message, 500, details);
    this.name = 'PersistenceError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}

export class AIError extends AppError {
  constructor(message: string, details?: unknown) {
    super('AI_ERROR', message, 502, details);
    this.name = 'AIError';
  }
}
