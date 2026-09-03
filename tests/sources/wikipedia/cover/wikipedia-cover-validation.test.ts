import { describe, it, expect } from 'vitest';
import {
  normalizeForComparison,
  extractQueryTokens,
  hasTokenOverlap,
  isBlacklistedByTitle,
  validateWikipediaPage,
  isGamePageValid,
  extractInfoboxImage,
  buildWikipediaImageUrl,
  computeRelevanceScore,
} from '../../../../src/sources/wikipedia/cover/wikipedia-cover-validation.js';

describe('Wikipedia Cover Validation', () => {
  describe('normalizeForComparison', () => {
    it('lowercases and removes special characters', () => {
      expect(normalizeForComparison('The Legend of Zelda')).toBe('the legend of zelda');
    });

    it('normalizes whitespace', () => {
      expect(normalizeForComparison('  multiple   spaces  ')).toBe('multiple spaces');
    });

    it('removes accented characters', () => {
      expect(normalizeForComparison('Pokémon')).toBe('pokemon');
    });
  });

  describe('extractQueryTokens', () => {
    it('extracts tokens longer than 2 characters', () => {
      const tokens = extractQueryTokens('Legend of Legaia');
      expect(tokens).toContain('legend');
      expect(tokens).toContain('legaia');
      expect(tokens).not.toContain('of');
    });

    it('handles empty query', () => {
      const tokens = extractQueryTokens('');
      expect(tokens).toEqual([]);
    });

    it('handles single word query', () => {
      const tokens = extractQueryTokens('Doom');
      expect(tokens).toContain('doom');
    });
  });

  describe('hasTokenOverlap', () => {
    it('returns true when title contains query tokens', () => {
      const tokens = extractQueryTokens('Legend of Legaia');
      expect(hasTokenOverlap('Legend of Legaia (video game)', tokens)).toBe(true);
    });

    it('returns false when title has no matching tokens', () => {
      const tokens = extractQueryTokens('Legend of Legaia');
      expect(hasTokenOverlap('Zelda Fitzgerald', tokens)).toBe(false);
    });

    it('handles partial token matches', () => {
      const tokens = extractQueryTokens('Resident Evil');
      expect(hasTokenOverlap('Resident Evil 4 Remake', tokens)).toBe(true);
    });
  });

  describe('isBlacklistedByTitle', () => {
    it('blacklists soundtrack titles', () => {
      expect(isBlacklistedByTitle('Zelda Soundtrack')).toBe(true);
    });

    it('blacklists film titles', () => {
      expect(isBlacklistedByTitle('Resident Evil Film')).toBe(true);
    });

    it('allows valid game titles', () => {
      expect(isBlacklistedByTitle('The Legend of Zelda')).toBe(false);
    });

    it('blacklists album titles', () => {
      expect(isBlacklistedByTitle('Final Fantasy Album')).toBe(true);
    });
  });

  describe('validateWikipediaPage', () => {
    it('detects video game pages', () => {
      const page = {
        pageid: 12345,
        title: 'The Legend of Zelda',
        wikitext: {
          '*':
            '{{Infobox video game\n' +
            '| title = The Legend of Zelda\n' +
            '| developer = Nintendo\n' +
            '| publisher = Nintendo\n' +
            '| platform = NES\n' +
            '}}',
        },
      };

      const signals = validateWikipediaPage(page);
      expect(signals.hasInfobox).toBe(true);
      expect(signals.hasDeveloper).toBe(true);
      expect(signals.hasPublisher).toBe(true);
      expect(signals.hasPlatform).toBe(true);
      expect(signals.isVideoGame).toBe(true);
      expect(signals.confidence).toBeGreaterThan(0.5);
    });

    it('detects non-game pages', () => {
      const page = {
        pageid: 99999,
        title: 'Zelda Fitzgerald',
        wikitext: {
          '*':
            '{{Infobox person\n' +
            '| name = Zelda Fitzgerald\n' +
            '| birth_date = July 24, 1900\n' +
            '}}',
        },
      };

      const signals = validateWikipediaPage(page);
      expect(signals.hasInfobox).toBe(true);
      expect(signals.hasDeveloper).toBe(false);
      expect(signals.hasPublisher).toBe(false);
      expect(signals.hasPlatform).toBe(false);
      expect(signals.isVideoGame).toBe(false);
    });

    it('handles pages without infobox', () => {
      const page = {
        pageid: 11111,
        title: 'Random Page',
        wikitext: { '*': 'This is just text.' },
      };

      const signals = validateWikipediaPage(page);
      expect(signals.hasInfobox).toBe(false);
      expect(signals.confidence).toBe(0);
    });
  });

  describe('isGamePageValid', () => {
    it('accepts pages with video game in wikitext', () => {
      const signals = {
        hasInfobox: true,
        hasDeveloper: false,
        hasPublisher: false,
        hasPlatform: false,
        hasGenre: false,
        hasReleaseDate: false,
        isVideoGame: true,
        confidence: 0.35,
      };
      expect(isGamePageValid(signals)).toBe(true);
    });

    it('accepts pages with developer and publisher', () => {
      const signals = {
        hasInfobox: true,
        hasDeveloper: true,
        hasPublisher: true,
        hasPlatform: false,
        hasGenre: false,
        hasReleaseDate: false,
        isVideoGame: false,
        confidence: 0.5,
      };
      expect(isGamePageValid(signals)).toBe(true);
    });

    it('rejects pages without infobox', () => {
      const signals = {
        hasInfobox: false,
        hasDeveloper: true,
        hasPublisher: true,
        hasPlatform: false,
        hasGenre: false,
        hasReleaseDate: false,
        isVideoGame: false,
        confidence: 0.3,
      };
      expect(isGamePageValid(signals)).toBe(false);
    });

    it('rejects pages with only one game signal', () => {
      const signals = {
        hasInfobox: true,
        hasDeveloper: true,
        hasPublisher: false,
        hasPlatform: false,
        hasGenre: false,
        hasReleaseDate: false,
        isVideoGame: false,
        confidence: 0.35,
      };
      expect(isGamePageValid(signals)).toBe(false);
    });
  });

  describe('extractInfoboxImage', () => {
    it('extracts image from infobox', () => {
      const wikitext =
        '{{Infobox video game\n| image = Zelda NES.png\n| title = The Legend of Zelda\n}}';
      expect(extractInfoboxImage(wikitext)).toBe('Zelda NES.png');
    });

    it('extracts cover image', () => {
      const wikitext = '{{Infobox video game\n| cover = game_cover.jpg\n| title = Test Game\n}}';
      expect(extractInfoboxImage(wikitext)).toBe('game_cover.jpg');
    });

    it('returns null when no image found', () => {
      const wikitext = '{{Infobox video game\n| title = Test Game\n}}';
      expect(extractInfoboxImage(wikitext)).toBeNull();
    });

    it('handles wiki markup in image names', () => {
      const wikitext = '{{Infobox video game\n| image = [[File:Game.png|200px]]\n}}';
      const result = extractInfoboxImage(wikitext);
      expect(result).toBe('Game.png');
    });
  });

  describe('buildWikipediaImageUrl', () => {
    it('converts filename to Special:FilePath URL', () => {
      const url = buildWikipediaImageUrl('Game Cover.png');
      expect(url).toBe('https://en.wikipedia.org/wiki/Special:FilePath/Game_Cover.png');
    });

    it('preserves full URLs', () => {
      const url = buildWikipediaImageUrl('https://example.com/image.jpg');
      expect(url).toBe('https://example.com/image.jpg');
    });
  });

  describe('computeRelevanceScore', () => {
    it('gives perfect score for exact match', () => {
      const tokens = extractQueryTokens('The Legend of Zelda');
      const score = computeRelevanceScore('The Legend of Zelda', 'The Legend of Zelda', tokens);
      expect(score).toBe(1.0);
    });

    it('gives high score for title starting with query', () => {
      const tokens = extractQueryTokens('The Legend of Zelda');
      const score = computeRelevanceScore(
        'The Legend of Zelda: Breath of the Wild',
        'The Legend of Zelda',
        tokens,
      );
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    it('gives low score for unrelated title', () => {
      const tokens = extractQueryTokens('The Legend of Zelda');
      const score = computeRelevanceScore('Zelda Fitzgerald', 'The Legend of Zelda', tokens);
      expect(score).toBeLessThan(0.7);
    });
  });
});
