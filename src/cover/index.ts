export {
  CoverEngine,
  type CoverEngineDependencies,
  type CoverSearchOptions,
} from './cover-engine.js';
export {
  validateCoverUrl,
  validateCoverCandidate,
  filterValidCandidates,
  normalizeCoverUrl,
  deduplicateCandidates,
  type CoverValidationResult,
} from './cover-validate.js';
export { rankCandidate, rankCandidates } from './cover-rank.js';
