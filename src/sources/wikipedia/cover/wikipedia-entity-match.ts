import { normalizeForComparison } from './wikipedia-cover-validation.js';

const MIN_ENTITY_MATCH = 0.5;

export function extractTrailingNumber(text: string): number | null {
  const match = text.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : null;
}

function extractAnyNumber(text: string): number | null {
  const match = text.match(/\b(\d+)\b/);
  return match ? parseInt(match[1], 10) : null;
}

function hasTokenOverlap(normalizedTitle: string, queryTokens: string[]): boolean {
  const titleTokens = normalizedTitle.split(' ');
  return queryTokens.some((token) =>
    titleTokens.some((titleToken) => titleToken.includes(token) || token.includes(titleToken)),
  );
}

export function computeEntityMatch(
  pageTitle: string,
  query: string,
  queryTokens: string[],
): number {
  const normalizedTitle = normalizeForComparison(pageTitle);
  const normalizedQuery = normalizeForComparison(query);

  if (normalizedTitle === normalizedQuery) return 1.0;

  if (!hasTokenOverlap(normalizedTitle, queryTokens)) return 0.1;

  if (normalizedTitle.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedTitle)) {
    const titleNum = extractAnyNumber(normalizedTitle);
    const queryNum = extractAnyNumber(normalizedQuery);

    if (queryNum !== null && titleNum === null) {
      return 0.3;
    }

    if (queryNum !== null && titleNum !== null && titleNum !== queryNum) {
      return 0.3;
    }

    return 0.9;
  }

  const titleNum = extractAnyNumber(normalizedTitle);
  const queryNum = extractAnyNumber(normalizedQuery);

  if (queryNum !== null && titleNum === null) {
    return 0.3;
  }

  if (queryNum !== null && titleNum !== null && titleNum !== queryNum) {
    return 0.3;
  }

  const titleTokens = normalizedTitle.split(' ');
  const matchedTokens = queryTokens.filter((token) =>
    titleTokens.some((titleToken) => titleToken.includes(token) || token.includes(titleToken)),
  );

  if (matchedTokens.length === queryTokens.length) return 0.8;

  if (matchedTokens.length > 0) {
    return 0.5 + (matchedTokens.length / queryTokens.length) * 0.3;
  }

  return 0.1;
}

export function isEntityMatchValid(entityMatchScore: number): boolean {
  return entityMatchScore >= MIN_ENTITY_MATCH;
}
