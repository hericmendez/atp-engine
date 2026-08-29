import type { GameId, ReleaseId } from '../shared/ids.js';
import type { Platform } from '../shared/platform.js';
import type { Region } from '../shared/region.js';
import type { ReleaseDate } from '../shared/release-date.js';
import type { ExternalIdentifier } from '../shared/external-identifier.js';
import type { SourceEvidence } from '../shared/source-evidence.js';
import type { DistributionChannel } from '../shared/distribution-channel.js';
import type { Launcher } from '../shared/launcher.js';

export interface Release {
  readonly id: ReleaseId;
  readonly gameId: GameId;
  readonly platform: Platform;
  readonly region: Region | null;
  readonly releaseDate: ReleaseDate | null;
  readonly version: string | null;
  readonly edition: string | null;
  readonly distributionChannels: readonly DistributionChannel[];
  readonly launchers: readonly Launcher[];
  readonly externalIdentifiers: readonly ExternalIdentifier[];
  readonly evidence: readonly SourceEvidence[];
}

export interface CreateReleaseInput {
  id: ReleaseId;
  gameId: GameId;
  platform: Platform;
  region?: Region | null;
  releaseDate?: ReleaseDate | null;
  version?: string | null;
  edition?: string | null;
  distributionChannels?: readonly DistributionChannel[];
  launchers?: readonly Launcher[];
  externalIdentifiers?: readonly ExternalIdentifier[];
  evidence?: readonly SourceEvidence[];
}

export function createRelease(input: CreateReleaseInput): Release {
  return {
    id: input.id,
    gameId: input.gameId,
    platform: input.platform,
    region: input.region ?? null,
    releaseDate: input.releaseDate ?? null,
    version: input.version ?? null,
    edition: input.edition ?? null,
    distributionChannels: input.distributionChannels ? [...input.distributionChannels] : [],
    launchers: input.launchers ? [...input.launchers] : [],
    externalIdentifiers: input.externalIdentifiers ?? [],
    evidence: input.evidence ?? [],
  };
}
