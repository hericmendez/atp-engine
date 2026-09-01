export type {
  RawCandidate,
  RawExternalIdentifier,
  RawClassificationHint,
} from './raw-candidate.js';

export type {
  SourceAdapter,
  SearchOptions,
  SearchResult,
  SourceCapabilities,
} from './source-adapter.js';

export { SourceRegistry } from './source-registry.js';

export {
  SourceError,
  createSourceTimeout,
  createSourceNotFound,
  createSourceUnavailable,
  createParseFailure,
  type SourceErrorType,
} from './source-errors.js';

export { WikipediaAdapter, type WikipediaAdapterConfig } from './wikipedia/index.js';

export { SteamAdapter, type SteamAdapterConfig } from './steam/index.js';

export { IgdbAdapter, type IgdbAdapterConfig } from './igdb/index.js';
