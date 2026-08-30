import type { CoverCandidate } from '../domain/cover/cover-candidate.js';

const VALID_URL_PATTERN = /^https?:\/\/.+/i;
const INVALID_URL_PATTERNS = [/^https?:\/\/$/i, /^https?:\/\/[^/]+$/i];

export interface CoverValidationResult {
  readonly valid: boolean;
  readonly reason: string | null;
}

export function validateCoverUrl(url: string): CoverValidationResult {
  if (!url || url.trim().length === 0) {
    return { valid: false, reason: 'empty_url' };
  }

  const trimmed = url.trim();

  if (!VALID_URL_PATTERN.test(trimmed)) {
    return { valid: false, reason: 'invalid_url_format' };
  }

  for (const pattern of INVALID_URL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: 'incomplete_url' };
    }
  }

  try {
    new URL(trimmed);
  } catch {
    return { valid: false, reason: 'malformed_url' };
  }

  return { valid: true, reason: null };
}

export function validateCoverCandidate(candidate: CoverCandidate): CoverValidationResult {
  const urlResult = validateCoverUrl(candidate.url);
  if (!urlResult.valid) {
    return urlResult;
  }

  if (!candidate.source || candidate.source.trim().length === 0) {
    return { valid: false, reason: 'missing_source' };
  }

  if (!candidate.sourceId || candidate.sourceId.trim().length === 0) {
    return { valid: false, reason: 'missing_source_id' };
  }

  return { valid: true, reason: null };
}

export function filterValidCandidates(candidates: CoverCandidate[]): CoverCandidate[] {
  return candidates.filter((c) => validateCoverCandidate(c).valid);
}

export function normalizeCoverUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

export function deduplicateCandidates(candidates: CoverCandidate[]): CoverCandidate[] {
  const seenBySourceId = new Set<string>();
  const seenByUrl = new Set<string>();
  const result: CoverCandidate[] = [];

  for (const candidate of candidates) {
    const normalizedUrl = normalizeCoverUrl(candidate.url);
    const sourceKey = `${candidate.source}:${candidate.sourceId}`;
    const urlKey = `url:${normalizedUrl}`;

    if (seenBySourceId.has(sourceKey) || seenByUrl.has(urlKey)) {
      continue;
    }

    seenBySourceId.add(sourceKey);
    seenByUrl.add(urlKey);
    result.push(candidate);
  }

  return result;
}
