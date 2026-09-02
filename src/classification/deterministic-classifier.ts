import { ClassificationCategory } from '../domain/shared/classification-category.js';
import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type { Classifier } from './classifier.js';
import type { ClassificationResult } from './classification-result.js';
import type { ClassificationSignal, SignalSource } from './classification-signal.js';
import { logger } from '../infrastructure/logger/logger.js';

const CONFIDENCE_THRESHOLD = 0.3;

interface WeightedCategory {
  category: ClassificationCategory;
  totalWeight: number;
  maxConfidence: number;
  signals: ClassificationSignal[];
}

export class DeterministicClassifier implements Classifier {
  async classify(candidate: NormalizedCandidate): Promise<ClassificationResult> {
    const startTime = Date.now();
    const signals: ClassificationSignal[] = [];

    this.collectSourceSignals(candidate, signals);
    this.collectTitleSignals(candidate, signals);
    this.collectGenreSignals(candidate, signals);
    this.collectDescriptionSignals(candidate, signals);

    const result = this.resolve(signals);
    const durationMs = Date.now() - startTime;

    logger.info('classification.completed', {
      category: result.category,
      confidence: result.confidence,
      signalCount: signals.length,
      durationMs,
    });

    return result;
  }

  private collectSourceSignals(
    candidate: NormalizedCandidate,
    signals: ClassificationSignal[],
  ): void {
    for (const hint of candidate.classificationHints) {
      const category = this.parseCategory(hint.category);
      if (!category) continue;

      const isSourceTypeHint = hint.evidence.toLowerCase().includes('type:');
      const source: SignalSource = isSourceTypeHint ? 'source-type' : 'source-category';

      signals.push({
        source,
        category,
        weight: isSourceTypeHint ? 1.0 : 0.8,
        confidence: hint.confidence,
        evidence: hint.evidence,
      });
    }
  }

  private collectTitleSignals(
    candidate: NormalizedCandidate,
    signals: ClassificationSignal[],
  ): void {
    const title = candidate.titles[0]?.value?.toLowerCase() ?? '';
    if (!title) return;

    const titlePatterns: Array<{
      pattern: RegExp;
      category: ClassificationCategory;
      weight: number;
      confidence: number;
    }> = [
      {
        pattern: /\bvideo game\b|\bplayable\b|\bgameplay\b/,
        category: ClassificationCategory.GAME,
        weight: 0.8,
        confidence: 0.7,
      },
      {
        pattern: /\bsoundtrack\b|\bost\b|\boriginal score\b/,
        category: ClassificationCategory.SOUNDTRACK,
        weight: 0.7,
        confidence: 0.6,
      },
      { pattern: /\bdlc\b/, category: ClassificationCategory.DLC, weight: 0.7, confidence: 0.6 },
      {
        pattern: /\bexpansion pack\b|\bexpansion\b/,
        category: ClassificationCategory.EXPANSION,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\bmovie\b|\bfilm\b/,
        category: ClassificationCategory.MOVIE,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\btv series\b|\btelevision\b|\btv show\b/,
        category: ClassificationCategory.TV_SHOW,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\banime\b/,
        category: ClassificationCategory.ANIME,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\bguide\b|\bstrategy guide\b|\bwalkthrough\b/,
        category: ClassificationCategory.BOOK,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\bhardware\b|\bconsole\b|\bcontroller\b/,
        category: ClassificationCategory.HARDWARE,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\bpromotional\b|\bpromo\b|\bbonus content\b/,
        category: ClassificationCategory.PROMOTIONAL,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\bcharacter design\b|\bart book\b|\bconcept art\b/,
        category: ClassificationCategory.CHARACTER,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\bfranchise\b|\bseries overview\b/,
        category: ClassificationCategory.FRANCHISE,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\bprofile\b|\bbiography\b|\bpedia\b/,
        category: ClassificationCategory.PERSON,
        weight: 0.7,
        confidence: 0.6,
      },
      {
        pattern: /\bevent\b|\btournament\b|\bconvention\b/,
        category: ClassificationCategory.EVENT,
        weight: 0.7,
        confidence: 0.6,
      },
    ];

    for (const { pattern, category, weight, confidence } of titlePatterns) {
      if (pattern.test(title)) {
        signals.push({
          source: 'title-pattern',
          category,
          weight,
          confidence,
          evidence: `Title matches pattern: ${pattern.source}`,
        });
      }
    }
  }

  private collectGenreSignals(
    candidate: NormalizedCandidate,
    signals: ClassificationSignal[],
  ): void {
    const gameGenres = [
      'action',
      'adventure',
      'rpg',
      'role-playing',
      'strategy',
      'puzzle',
      'simulation',
      'racing',
      'sports',
      'fighting',
      'platformer',
      'shooter',
      'stealth',
      'survival',
      'horror',
      'mmorpg',
      'roguelike',
      'indie',
    ];

    const genreNames = candidate.genres.map((g) => g.name.toLowerCase());
    const hasGameGenre = genreNames.some((g) =>
      gameGenres.some((gameGenre) => g.includes(gameGenre)),
    );

    if (hasGameGenre && genreNames.length > 0) {
      signals.push({
        source: 'genre-indicator',
        category: ClassificationCategory.GAME,
        weight: 0.3,
        confidence: 0.3,
        evidence: `Genres contain game-specific terms: ${genreNames.join(', ')}`,
      });
    }
  }

  private collectDescriptionSignals(
    candidate: NormalizedCandidate,
    signals: ClassificationSignal[],
  ): void {
    if (!candidate.description) return;

    const desc = candidate.description.toLowerCase();

    const descPatterns: Array<{
      pattern: RegExp;
      category: ClassificationCategory;
      weight: number;
      confidence: number;
    }> = [
      {
        pattern: /\bvideo game\b|\bplayable\b|\bgameplay\b|\bin-game\b/,
        category: ClassificationCategory.GAME,
        weight: 0.6,
        confidence: 0.5,
      },
      {
        pattern: /\bsoundtrack\b|\boriginal score\b|\bfeatures.*music\b/,
        category: ClassificationCategory.SOUNDTRACK,
        weight: 0.6,
        confidence: 0.5,
      },
      {
        pattern: /\bmovie\b|\bfilm\b|\bfeature film\b/,
        category: ClassificationCategory.MOVIE,
        weight: 0.6,
        confidence: 0.5,
      },
      {
        pattern: /\btelevision\b|\btv series\b|\banimated series\b/,
        category: ClassificationCategory.TV_SHOW,
        weight: 0.6,
        confidence: 0.5,
      },
      {
        pattern: /\banime\b|\banimated\b/,
        category: ClassificationCategory.ANIME,
        weight: 0.6,
        confidence: 0.5,
      },
      {
        pattern: /\bbook\b|\bnovel\b|\bguide book\b/,
        category: ClassificationCategory.BOOK,
        weight: 0.6,
        confidence: 0.5,
      },
    ];

    for (const { pattern, category, weight, confidence } of descPatterns) {
      if (pattern.test(desc)) {
        signals.push({
          source: 'description-keyword',
          category,
          weight,
          confidence,
          evidence: `Description matches pattern: ${pattern.source}`,
        });
      }
    }
  }

  private parseCategory(raw: string): ClassificationCategory | null {
    const normalized = raw.trim().toUpperCase() as ClassificationCategory;
    if (Object.values(ClassificationCategory).includes(normalized)) {
      return normalized;
    }
    return null;
  }

  private resolve(signals: ClassificationSignal[]): ClassificationResult {
    if (signals.length === 0) {
      return {
        category: ClassificationCategory.UNKNOWN,
        confidence: 0,
        signals: [],
        reason: 'No classification signals available',
      };
    }

    const categories = new Map<ClassificationCategory, WeightedCategory>();

    for (const signal of signals) {
      let entry = categories.get(signal.category);
      if (!entry) {
        entry = { category: signal.category, totalWeight: 0, maxConfidence: 0, signals: [] };
        categories.set(signal.category, entry);
      }
      entry.totalWeight += signal.weight * signal.confidence;
      entry.maxConfidence = Math.max(entry.maxConfidence, signal.confidence);
      entry.signals.push(signal);
    }

    let best: WeightedCategory | null = null;
    for (const entry of categories.values()) {
      if (!best || entry.totalWeight > best.totalWeight) {
        best = entry;
      }
    }

    if (!best || best.totalWeight < CONFIDENCE_THRESHOLD) {
      return {
        category: ClassificationCategory.UNKNOWN,
        confidence: 0,
        signals,
        reason:
          signals.length > 0
            ? `Insufficient confidence: strongest category scored ${best?.totalWeight.toFixed(2) ?? '0.00'} (threshold: ${CONFIDENCE_THRESHOLD})`
            : 'No classification signals available',
      };
    }

    const overallConfidence = Math.min(1.0, best.totalWeight);

    const conflictingCategories = Array.from(categories.values()).filter(
      (e) => e.category !== best!.category && e.totalWeight >= CONFIDENCE_THRESHOLD,
    );

    let reason: string;
    if (conflictingCategories.length > 0) {
      reason = `Conflicting signals resolved by weighted scoring: ${best.category} (${best.totalWeight.toFixed(2)}) vs ${conflictingCategories.map((c) => `${c.category} (${c.totalWeight.toFixed(2)})`).join(', ')}`;
    } else {
      const signalSummary = best.signals.map((s) => `${s.source}:${s.category}`).join(', ');
      reason = `Classified as ${best.category} based on: ${signalSummary}`;
    }

    return {
      category: best.category,
      confidence: overallConfidence,
      signals,
      reason,
    };
  }
}
