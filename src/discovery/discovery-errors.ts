import type { DiscoverySourceError } from './discovery-types.js';

/**
 * Public boundary for discovery errors.
 *
 * Lower-level HTTP helpers embed the requested upstream URL in
 * SourceError messages. URLs must never leave the API: they leak query
 * structure and can carry credentials/tokens. Sanitization strips URLs
 * while preserving provider, type, and retryability verbatim.
 */

const URL_PATTERN = /https?:\/\/\S+/g;

export function sanitizeDiscoveryErrorMessage(message: string): string {
  const stripped = message.replace(URL_PATTERN, '').replace(/\s+/g, ' ').trim();
  return stripped.length > 0 ? stripped : 'Upstream provider request failed';
}

export function sanitizeDiscoveryError(error: DiscoverySourceError): DiscoverySourceError {
  return {
    source: error.source,
    errorType: error.errorType,
    message: sanitizeDiscoveryErrorMessage(error.message),
    retryable: error.retryable,
  };
}

export function sanitizeDiscoveryErrors(
  errors: readonly DiscoverySourceError[],
): DiscoverySourceError[] {
  return errors.map(sanitizeDiscoveryError);
}
