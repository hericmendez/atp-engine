import type { ClassificationCategory } from '../domain/shared/classification-category.js';
import type { ClassificationSignal } from './classification-signal.js';

export interface ClassificationResult {
  readonly category: ClassificationCategory;
  readonly confidence: number;
  readonly signals: readonly ClassificationSignal[];
  readonly reason: string;
}
