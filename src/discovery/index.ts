export type {
  DiscoveryRequest,
  DiscoveryResult,
  DiscoveryGroupResult,
  DiscoverySourceObservation,
  DiscoverySourceError,
  RankingBreakdown,
} from './discovery-types.js';

export { DiscoveryEngine } from './discovery-engine.js';
export { aggregateAndDeduplicate, rankGroups } from './aggregation.js';
