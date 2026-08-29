export type {
  NormalizedCandidate,
  NormalizedTitle,
  NormalizedRelease,
  Provenance,
  TitleType,
} from './normalized-candidate.js';

export {
  normalizeTitle,
  normalizeTitleType,
  normalizeReleaseDate,
  normalizePlatform,
  normalizeRegion,
  normalizeOrganization,
  normalizeGenre,
  normalizeExternalIdentifier,
  normalizeDistributionChannel,
  normalizeLauncher,
  normalizeProvenance,
  normalizeCandidate,
  type RawCandidateInput,
} from './normalize.js';

export { resolvePlatformAlias, resolvePlatformFamily } from './platform-aliases.js';
export { resolveRegionAlias } from './region-aliases.js';
