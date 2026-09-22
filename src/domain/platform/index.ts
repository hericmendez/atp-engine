export type { PlatformCatalogEntry, PlatformStatus } from './platform-catalog.js';

export { createPlatformCatalogEntry } from './platform-catalog.js';

export type { ATPPlatform } from './atp-platform.js';

export {
  createATPPlatform,
  slugifyPlatformName,
  addPlatformExternalIdentity,
  findPlatformExternalIdentity,
  atpPlatformEquals,
} from './atp-platform.js';

export type { PlatformExternalIdentity } from './platform-external-identity.js';

export {
  createPlatformExternalIdentity,
  platformExternalIdentityEquals,
  platformExternalIdentityKey,
} from './platform-external-identity.js';

export type {
  PlatformCatalogRepository,
  PlatformCatalogQuery,
  PlatformCatalogEntryWithGameCount,
  PaginatedPlatformResult,
  PlatformSortField,
  PlatformSortDirection,
  PlatformSort,
} from './platform-catalog-repository.js';
