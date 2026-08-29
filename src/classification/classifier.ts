import type { NormalizedCandidate } from '../normalization/normalized-candidate.js';
import type { ClassificationResult } from './classification-result.js';

export interface Classifier {
  classify(candidate: NormalizedCandidate): ClassificationResult;
}
