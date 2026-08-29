export type { Game, CreateGameInput } from './game/game.js';
export {
  createGame,
  gameAddRelease,
  gameAddRelationship,
  gameAddTitle,
  gameAddEvidence,
  gameAddExternalIdentifier,
  gameWithClassification,
  gameWithCompleteness,
  gameFindRelease,
  gameHasRelationship,
  gamePrimaryTitle,
} from './game/game.js';

export type { GameRepository, FindByExternalIdentifierInput } from './game/game-repository.js';

export type { Release, CreateReleaseInput } from './game/release.js';
export { createRelease } from './game/release.js';

export type { GameRelationship, CreateGameRelationshipInput } from './game/game-relationship.js';
export { createGameRelationship, gameRelationshipEquals } from './game/game-relationship.js';

export type { GameId, ReleaseId } from './shared/ids.js';
export { createGameId, createReleaseId } from './shared/ids.js';

export { ClassificationCategory, GAME_LIKE_CATEGORIES } from './shared/classification-category.js';
export { GameRelationshipType } from './shared/game-relationship-type.js';
export { IdentityOutcome } from './shared/identity-outcome.js';
export { MetadataCompleteness } from './shared/metadata-completeness.js';

export type { ReleaseDate, DatePrecision } from './shared/release-date.js';
export { createReleaseDate, releaseDateEquals } from './shared/release-date.js';

export type { ExternalIdentifier } from './shared/external-identifier.js';
export {
  createExternalIdentifier,
  externalIdentifierEquals,
} from './shared/external-identifier.js';

export type { SourceEvidence } from './shared/source-evidence.js';
export {
  createSourceEvidence,
  sourceEvidenceToExternalIdentifier,
} from './shared/source-evidence.js';

export type { Platform, PlatformFamily, PlatformType } from './shared/platform.js';
export { createPlatform, platformEquals } from './shared/platform.js';

export type { Region } from './shared/region.js';
export { createRegion, regionEquals } from './shared/region.js';

export type { Organization, Developer, Publisher } from './shared/organization.js';
export {
  createOrganization,
  createDeveloper,
  createPublisher,
  developerEquals,
  publisherEquals,
  organizationEquals,
} from './shared/organization.js';

export type { Genre } from './shared/genre.js';
export { createGenre, genreEquals } from './shared/genre.js';

export type { DistributionChannel } from './shared/distribution-channel.js';
export {
  createDistributionChannel,
  distributionChannelEquals,
} from './shared/distribution-channel.js';

export type { Launcher } from './shared/launcher.js';
export { createLauncher, launcherEquals } from './shared/launcher.js';

export type { GameTitle, TitleType } from './shared/title.js';
export { createGameTitle, gameTitleEquals } from './shared/title.js';

export {
  DomainError,
  InvalidGameError,
  InvalidReleaseError,
  InvalidRelationshipError,
} from './shared/errors.js';
