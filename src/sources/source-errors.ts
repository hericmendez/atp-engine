export type SourceErrorType =
  | 'timeout'
  | 'rate_limited'
  | 'network_failure'
  | 'invalid_response'
  | 'source_unavailable'
  | 'not_found'
  | 'parse_failure'
  | 'authentication_failure';

export class SourceError extends Error {
  readonly source: string;
  readonly errorType: SourceErrorType;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    source: string,
    errorType: SourceErrorType,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SourceError';
    this.source = source;
    this.errorType = errorType;
    this.retryable = isRetryable(errorType);
    this.details = details;
  }
}

function isRetryable(errorType: SourceErrorType): boolean {
  switch (errorType) {
    case 'timeout':
    case 'rate_limited':
    case 'network_failure':
    case 'source_unavailable':
    case 'invalid_response':
      return true;
    case 'not_found':
    case 'parse_failure':
    case 'authentication_failure':
      return false;
  }
}

export function createSourceTimeout(source: string, timeoutMs: number): SourceError {
  return new SourceError(source, 'timeout', `Source ${source} timed out after ${timeoutMs}ms`);
}

export function createSourceNotFound(source: string, id: string): SourceError {
  return new SourceError(source, 'not_found', `Record ${id} not found in ${source}`);
}

export function createSourceUnavailable(source: string, reason?: string): SourceError {
  const message = reason
    ? `Source ${source} is unavailable: ${reason}`
    : `Source ${source} is unavailable`;
  return new SourceError(source, 'source_unavailable', message);
}

export function createParseFailure(source: string, reason: string): SourceError {
  return new SourceError(source, 'parse_failure', `Failed to parse ${source} response: ${reason}`);
}
