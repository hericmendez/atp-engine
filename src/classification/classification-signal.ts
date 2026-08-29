import type { ClassificationCategory } from '../domain/shared/classification-category.js';

export type SignalSource =
  | 'source-type'
  | 'source-category'
  | 'title-pattern'
  | 'infobox-type'
  | 'category-list'
  | 'genre-indicator'
  | 'metadata-field'
  | 'description-keyword';

export interface ClassificationSignal {
  readonly source: SignalSource;
  readonly category: ClassificationCategory;
  readonly weight: number;
  readonly confidence: number;
  readonly evidence: string;
}
