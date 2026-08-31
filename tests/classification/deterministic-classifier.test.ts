import { describe, it, expect } from 'vitest';
import { DeterministicClassifier } from '../../src/classification/deterministic-classifier.js';
import { ClassificationCategory } from '../../src/domain/shared/classification-category.js';
import type { NormalizedCandidate } from '../../src/normalization/normalized-candidate.js';

function makeCandidate(overrides: Partial<NormalizedCandidate> = {}): NormalizedCandidate {
  return {
    titles: [{ value: 'Test Game', type: 'primary' }],
    developers: [],
    publishers: [],
    genres: [],
    releases: [
      {
        platform: { name: 'Windows', family: 'PC' },
        region: null,
        releaseDate: null,
        version: null,
        edition: null,
        distributionChannels: [],
        launchers: [],
        externalIdentifiers: [],
      },
    ],
    externalIdentifiers: [],
    provenance: {
      source: 'test',
      sourceId: '1',
      retrievedAt: new Date().toISOString(),
      rawTitle: null,
    },
    classificationHints: [],
    description: null,
    ...overrides,
  };
}

describe('DeterministicClassifier', () => {
  const classifier = new DeterministicClassifier();

  describe('basic category classification', () => {
    it('classifies GAME from Steam type hint', async () => {
      const candidate = makeCandidate({
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'Steam type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.signals.length).toBeGreaterThan(0);
    });

    it('classifies DLC from Steam type hint', async () => {
      const candidate = makeCandidate({
        classificationHints: [{ category: 'DLC', confidence: 0.9, evidence: 'Steam type: dlc' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.DLC);
    });

    it('classifies SOUNDTRACK from Steam type hint', async () => {
      const candidate = makeCandidate({
        classificationHints: [
          { category: 'SOUNDTRACK', confidence: 0.9, evidence: 'Steam type: soundtrack' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.SOUNDTRACK);
    });

    it('classifies MOVIE from Wikipedia infobox', async () => {
      const candidate = makeCandidate({
        classificationHints: [
          { category: 'MOVIE', confidence: 0.7, evidence: 'Wikipedia infobox type: film' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.MOVIE);
    });

    it('classifies TV_SHOW from Wikipedia categories', async () => {
      const candidate = makeCandidate({
        classificationHints: [
          {
            category: 'TV_SHOW',
            confidence: 0.7,
            evidence: 'Wikipedia category: Television series',
          },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.TV_SHOW);
    });

    it('classifies ANIME from Wikipedia categories', async () => {
      const candidate = makeCandidate({
        classificationHints: [
          { category: 'ANIME', confidence: 0.7, evidence: 'Wikipedia category: Anime' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.ANIME);
    });

    it('classifies BOOK from title pattern', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil 4 Strategy Guide', type: 'primary' }],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.BOOK);
    });

    it('classifies HARDWARE from Wikipedia infobox', async () => {
      const candidate = makeCandidate({
        classificationHints: [
          { category: 'HARDWARE', confidence: 0.7, evidence: 'Wikipedia infobox type: console' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.HARDWARE);
    });

    it('classifies CHARACTER from title pattern', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Mario Character Design Art Book', type: 'primary' }],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.CHARACTER);
    });

    it('classifies FRANCHISE from title pattern', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'The Legend of Zelda Franchise Overview', type: 'primary' }],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.FRANCHISE);
    });

    it('classifies PERSON from title pattern', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Shigeru Miyamoto Profile', type: 'primary' }],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.PERSON);
    });

    it('classifies EVENT from title pattern', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'E3 2024 Tournament', type: 'primary' }],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.EVENT);
    });

    it('classifies PROMOTIONAL from title pattern', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Fortnite Promotional Bonus Content', type: 'primary' }],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.PROMOTIONAL);
    });
  });

  describe('platform independence', () => {
    it('does not classify as GAME based on PC platform', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown Software', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('does not classify as GAME based on Android platform', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown App', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Android', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('does not classify as GAME based on iOS platform', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown App', type: 'primary' }],
        releases: [
          {
            platform: { name: 'iOS', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('does not classify as GAME based on PlayStation platform', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown Title', type: 'primary' }],
        releases: [
          {
            platform: { name: 'PlayStation 5', family: 'PlayStation' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('does not classify as GAME based on Xbox platform', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown Title', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Xbox Series X', family: 'Xbox' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('does not classify as GAME based on Nintendo platform', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown Title', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Nintendo Switch', family: 'Nintendo' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });
  });

  describe('distribution independence', () => {
    it('does not classify as GAME based on Steam distribution', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown Software', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'Steam' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('does not classify as GAME based on Epic distribution', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown Software', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'Epic Games Store' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('does not classify as GAME based on GOG distribution', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown Software', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'GOG' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('does not classify as GAME based on Google Play distribution', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown App', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Android', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'Google Play' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('does not classify as GAME based on App Store distribution', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Unknown App', type: 'primary' }],
        releases: [
          {
            platform: { name: 'iOS', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'App Store' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });
  });

  describe('mobile classification', () => {
    it('classifies Android app as GAME when source provides GAME hint', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Mobile Game', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Android', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'Google Play' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [
          { category: 'GAME', confidence: 0.9, evidence: 'Google Play category: Games' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('returns UNKNOWN for Android app without game evidence', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Utility App', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Android', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'Google Play' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.UNKNOWN);
    });

    it('classifies iOS app as GAME when source provides GAME hint', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'iOS Game', type: 'primary' }],
        releases: [
          {
            platform: { name: 'iOS', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'App Store' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [
          { category: 'GAME', confidence: 0.9, evidence: 'App Store category: Games' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('returns UNKNOWN for iOS app without game evidence', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Productivity App', type: 'primary' }],
        releases: [
          {
            platform: { name: 'iOS', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'App Store' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.UNKNOWN);
    });

    it('returns UNKNOWN for APK without game evidence', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Some APK', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Android', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.UNKNOWN);
    });

    it('classifies delisted Android game as GAME', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Delisted Mobile Game', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Android', family: 'Mobile' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [
          { category: 'GAME', confidence: 0.9, evidence: 'Former Google Play category: Games' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });
  });

  describe('PC classification', () => {
    it('classifies Windows app as GAME when source provides GAME hint', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'PC Game', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'Steam' }],
            launchers: [{ name: 'Steam Client' }],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'Steam type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('classifies Windows DLC when source provides DLC hint', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game DLC', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'Steam' }],
            launchers: [{ name: 'Steam Client' }],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [{ category: 'DLC', confidence: 0.9, evidence: 'Steam type: dlc' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.DLC);
    });

    it('returns UNKNOWN for Windows software without game evidence', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Photo Editor Pro', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [{ name: 'Steam' }],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).not.toBe(ClassificationCategory.GAME);
    });

    it('classifies delisted PC game as GAME', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Delisted PC Game', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [
          { category: 'GAME', confidence: 0.9, evidence: 'Former Steam type: game' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('classifies abandonware as GAME when evidence supports it', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Classic Abandonware Game', type: 'primary' }],
        releases: [
          {
            platform: { name: 'Windows', family: 'PC' },
            region: null,
            releaseDate: null,
            version: null,
            edition: null,
            distributionChannels: [],
            launchers: [],
            externalIdentifiers: [],
          },
        ],
        classificationHints: [
          { category: 'GAME', confidence: 0.7, evidence: 'Wikipedia infobox type: video game' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });
  });

  describe('source hint priority', () => {
    it('Steam type hint has higher weight than title pattern', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Super Game Soundtrack', type: 'primary' }],
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'Steam type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('title SOUNDTRACK pattern overrides weak source hint', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game Name Soundtrack', type: 'primary' }],
        classificationHints: [{ category: 'GAME', confidence: 0.3, evidence: 'Weak hint' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.SOUNDTRACK);
    });
  });

  describe('conflicting signals', () => {
    it('resolves conflict by weighted scoring', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game DLC Pack', type: 'primary' }],
        classificationHints: [
          { category: 'GAME', confidence: 0.9, evidence: 'Steam type: game' },
          { category: 'DLC', confidence: 0.9, evidence: 'Steam type: dlc' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect([ClassificationCategory.GAME, ClassificationCategory.DLC]).toContain(result.category);
      expect(result.reason).toContain('Conflicting');
    });
  });

  describe('UNKNOWN classification', () => {
    it('returns UNKNOWN when no signals are available', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Mysterious Item', type: 'primary' }],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.UNKNOWN);
      expect(result.confidence).toBe(0);
    });

    it('returns UNKNOWN when signals are below threshold', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Vague Product', type: 'primary' }],
        classificationHints: [{ category: 'GAME', confidence: 0.1, evidence: 'Very weak hint' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.UNKNOWN);
    });
  });

  describe('remakes, remasters, ports', () => {
    it('classifies remake as GAME', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil 4 Remake', type: 'primary' }],
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'Steam type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('classifies remaster as GAME', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'The Last of Us Remastered', type: 'primary' }],
        classificationHints: [
          { category: 'GAME', confidence: 0.9, evidence: 'PlayStation type: game' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('classifies port as GAME', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Hollow Knight (Switch Port)', type: 'primary' }],
        classificationHints: [
          { category: 'GAME', confidence: 0.9, evidence: 'Nintendo eShop type: game' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });
  });

  describe('difficult edge cases', () => {
    it('The Sims 4: Get to Work is classified by source hint, not title', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'The Sims 4: Get to Work', type: 'primary' }],
        classificationHints: [
          { category: 'EXPANSION', confidence: 0.9, evidence: 'Origin type: expansion' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.EXPANSION);
    });

    it('Doom Eternal is classified as GAME, not DLC', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Doom Eternal', type: 'primary' }],
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'Steam type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('Game Demo with game hint is classified as GAME', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Cyberpunk 2077 Demo', type: 'primary' }],
        classificationHints: [{ category: 'GAME', confidence: 0.7, evidence: 'Steam type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('homebrew port classified by available evidence', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Ship of Harkinian', type: 'primary' }],
        classificationHints: [
          { category: 'GAME', confidence: 0.7, evidence: 'Community classification: game' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });
  });

  describe('signal tracking and explainability', () => {
    it('records all signals used for classification', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Action RPG Game', type: 'primary' }],
        genres: [{ name: 'action' }, { name: 'rpg' }],
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'Steam type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.signals.length).toBeGreaterThanOrEqual(2);
      expect(result.signals.some((s) => s.source === 'source-type')).toBe(true);
      expect(result.signals.some((s) => s.source === 'genre-indicator')).toBe(true);
    });

    it('includes reason explaining classification', async () => {
      const candidate = makeCandidate({
        classificationHints: [{ category: 'GAME', confidence: 0.9, evidence: 'Steam type: game' }],
      });
      const result = await classifier.classify(candidate);
      expect(result.reason).toBeTruthy();
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe('EXPANSION category', () => {
    it('classifies expansion from source hint', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Hearts of Stone', type: 'primary' }],
        classificationHints: [
          { category: 'EXPANSION', confidence: 0.9, evidence: 'GOG type: expansion' },
        ],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.EXPANSION);
    });

    it('classifies expansion from title pattern', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Witcher 3 Expansion Pack', type: 'primary' }],
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.EXPANSION);
    });
  });

  describe('description-based classification', () => {
    it('classifies GAME from description keywords', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'New Title', type: 'primary' }],
        description: 'An exciting video game with intense gameplay mechanics',
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.GAME);
    });

    it('classifies SOUNDTRACK from description keywords', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Game Name OST', type: 'primary' }],
        description: 'The original score and soundtrack from the game',
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.SOUNDTRACK);
    });

    it('classifies MOVIE from description keywords', async () => {
      const candidate = makeCandidate({
        titles: [{ value: 'Resident Evil', type: 'primary' }],
        description: 'A feature film based on the popular game series',
        classificationHints: [],
      });
      const result = await classifier.classify(candidate);
      expect(result.category).toBe(ClassificationCategory.MOVIE);
    });
  });
});
