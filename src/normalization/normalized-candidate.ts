import type { Platform } from '../domain/shared/platform.js';
import type { Region } from '../domain/shared/region.js';
import type { ReleaseDate } from '../domain/shared/release-date.js';
import type { Organization } from '../domain/shared/organization.js';
import type { Genre } from '../domain/shared/genre.js';
import type { ExternalIdentifier } from '../domain/shared/external-identifier.js';
import type { DistributionChannel } from '../domain/shared/distribution-channel.js';
import type { Launcher } from '../domain/shared/launcher.js';

export type TitleType = 'primary' | 'alternate' | 'localized' | 'abbreviated';

export interface NormalizedTitle {
  readonly value: string;
  readonly type: TitleType;
}

export interface NormalizedRelease {
  readonly platform: Platform;
  readonly region: Region | null;
  readonly releaseDate: ReleaseDate | null;
  readonly version: string | null;
  readonly edition: string | null;
  readonly distributionChannels: readonly DistributionChannel[];
  readonly launchers: readonly Launcher[];
  readonly externalIdentifiers: readonly ExternalIdentifier[];
}

export interface Provenance {
  readonly source: string;
  readonly sourceId: string;
  readonly retrievedAt: string;
  readonly rawTitle: string | null;
}

export interface NormalizedClassificationHint {
  readonly category: string;
  readonly confidence: number;
  readonly evidence: string;
}

export interface NormalizedCandidate {
  readonly titles: readonly NormalizedTitle[];
  readonly developers: readonly Organization[];
  readonly publishers: readonly Organization[];
  readonly genres: readonly Genre[];
  readonly releases: readonly NormalizedRelease[];
  readonly externalIdentifiers: readonly ExternalIdentifier[];
  readonly provenance: Provenance;
  readonly classificationHints: readonly NormalizedClassificationHint[];
  readonly description: string | null;
  readonly coverUrls: readonly string[];
  /**
   * Provider-declared game type/status, passed through verbatim for
   * downstream policy evaluation. Null when the source did not provide
   * them — never invented here.
   */
  readonly gameType: string | null;
  readonly gameStatus: string | null;
  /**
   * Provider parent references for future port-parent resolution.
   * Ingest-time evidence only; never used as identity here.
   */
  readonly parentGameId: string | null;
  readonly versionParentId: string | null;
}
