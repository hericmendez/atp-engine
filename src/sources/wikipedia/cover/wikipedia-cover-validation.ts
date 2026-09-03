import type { WikipediaPageParse, WikipediaValidationSignals } from './wikipedia-cover-types.js';

const SEMANTIC_BLACKLIST: readonly string[] = [
  'soundtrack',
  'album',
  'awards',
  'ceremony',
  'poster',
  'film',
  'movie',
  'television',
  'tv series',
  'anime',
  'manga',
  'novel',
  'book',
  'comic',
  'song',
  'single',
  'ep',
  'live performance',
  'concert',
  'biography',
  'autobiography',
  'memoir',
  'music',
  'ost',
];

export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractQueryTokens(query: string): string[] {
  return normalizeForComparison(query)
    .split(' ')
    .filter((token) => token.length > 2);
}

export function hasTokenOverlap(title: string, queryTokens: string[]): boolean {
  if (queryTokens.length === 0) return false;

  const normalizedTitle = normalizeForComparison(title);
  const titleTokens = normalizedTitle.split(' ');

  const matchedTokens = queryTokens.filter((token) =>
    titleTokens.some((titleToken) => titleToken.includes(token) || token.includes(titleToken)),
  );

  return matchedTokens.length > 0;
}

export function isBlacklistedByTitle(title: string): boolean {
  const normalizedTitle = normalizeForComparison(title);
  return SEMANTIC_BLACKLIST.some((term) => normalizedTitle.includes(term));
}

export function validateWikipediaPage(page: WikipediaPageParse): WikipediaValidationSignals {
  const wikitext = page.wikitext?.['*'] ?? '';

  const hasInfobox = wikitext.includes('{{Infobox') || wikitext.includes('{{infobox');
  const hasDeveloper = /developer\s*=/i.test(wikitext);
  const hasPublisher = /publisher\s*=/i.test(wikitext);
  const hasPlatform = /platform\s*=/i.test(wikitext);
  const hasGenre = /genre\s*=/i.test(wikitext);
  const hasReleaseDate = /release\s*date\s*=/i.test(wikitext);
  const isVideoGame = wikitext.includes('video game') || wikitext.includes('Video game');

  let confidence = 0;
  if (hasInfobox) confidence += 0.2;
  if (hasDeveloper) confidence += 0.15;
  if (hasPublisher) confidence += 0.15;
  if (hasPlatform) confidence += 0.15;
  if (hasGenre) confidence += 0.1;
  if (hasReleaseDate) confidence += 0.1;
  if (isVideoGame) confidence += 0.15;

  return {
    hasInfobox,
    hasDeveloper,
    hasPublisher,
    hasPlatform,
    hasGenre,
    hasReleaseDate,
    isVideoGame,
    confidence,
  };
}

export function isGamePageValid(signals: WikipediaValidationSignals): boolean {
  if (!signals.hasInfobox) return false;

  if (signals.isVideoGame) return true;

  const gameSignals = [signals.hasDeveloper, signals.hasPublisher, signals.hasPlatform].filter(
    Boolean,
  ).length;

  return gameSignals >= 2;
}

export function extractInfoboxImage(wikitext: string): string | null {
  const imageMatch = wikitext.match(
    /\|\s*(?:image|image_name|image_skyline|cover)\s*=\s*([^\n|]+)/i,
  );

  if (imageMatch?.[1]) {
    const rawImage = imageMatch[1].trim();
    const cleaned = rawImage
      .replace(/\[\[File:/gi, '')
      .replace(/\[\[Image:/gi, '')
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
      .replace(/\|.*/, '')
      .replace(/\]\]/g, '');
    return cleaned.length > 0 ? cleaned : null;
  }

  return null;
}

export function buildWikipediaImageUrl(imageName: string): string {
  if (imageName.startsWith('http://') || imageName.startsWith('https://')) {
    return imageName;
  }

  const encoded = encodeURIComponent(imageName.replace(/ /g, '_'));
  return `https://en.wikipedia.org/wiki/Special:FilePath/${encoded}`;
}

export function computeRelevanceScore(
  pageTitle: string,
  query: string,
  queryTokens: string[],
): number {
  const normalizedTitle = normalizeForComparison(pageTitle);
  const normalizedQuery = normalizeForComparison(query);

  if (normalizedTitle === normalizedQuery) return 1.0;

  if (normalizedTitle.startsWith(normalizedQuery)) return 0.9;

  if (normalizedQuery.startsWith(normalizedTitle)) return 0.7;

  const titleTokens = normalizedTitle.split(' ');
  const matchedTokens = queryTokens.filter((token) =>
    titleTokens.some((titleToken) => titleToken.includes(token) || token.includes(titleToken)),
  );

  if (matchedTokens.length === queryTokens.length) return 0.8;

  if (matchedTokens.length > 0) {
    return 0.5 + (matchedTokens.length / queryTokens.length) * 0.3;
  }

  if (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle)) {
    return 0.4;
  }

  return 0.1;
}
