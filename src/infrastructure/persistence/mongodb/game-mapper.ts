import type { Game } from '../../../domain/game/game.js';
import type { GameDocument } from './game-schema.js';
import { createGameId } from '../../../domain/shared/ids.js';
import { createGameTitle } from '../../../domain/shared/title.js';
import {
  createPlatform,
  type PlatformFamily,
  type PlatformType,
} from '../../../domain/shared/platform.js';
import { createRegion } from '../../../domain/shared/region.js';
import { createReleaseDate } from '../../../domain/shared/release-date.js';
import { createExternalIdentifier } from '../../../domain/shared/external-identifier.js';
import { createSourceEvidence } from '../../../domain/shared/source-evidence.js';
import { createOrganization } from '../../../domain/shared/organization.js';
import { createGenre } from '../../../domain/shared/genre.js';
import { createReleaseId } from '../../../domain/shared/ids.js';
import { createDistributionChannel } from '../../../domain/shared/distribution-channel.js';
import { createLauncher } from '../../../domain/shared/launcher.js';

export function toDomain(doc: GameDocument): Game {
  return {
    id: createGameId(doc.domainId),
    titles: doc.titles.map((t) =>
      createGameTitle(t.value, t.type as 'primary' | 'alternate' | 'localized' | 'abbreviated'),
    ),
    releases: doc.releases.map((r) => ({
      id: createReleaseId(r.domainId),
      gameId: createGameId(doc.domainId),
      platform: createPlatform(
        r.platform.name,
        (r.platform.family as PlatformFamily) ?? undefined,
        (r.platform.type as PlatformType) ?? undefined,
      ),
      region: r.region ? createRegion(r.region.name) : null,
      releaseDate: r.releaseDate
        ? createReleaseDate(
            r.releaseDate.year,
            r.releaseDate.month ?? undefined,
            r.releaseDate.day ?? undefined,
          )
        : null,
      version: r.version,
      edition: r.edition,
      distributionChannels: (r.distributionChannels ?? []).map((dc) =>
        createDistributionChannel(dc.name),
      ),
      launchers: (r.launchers ?? []).map((l) => createLauncher(l.name)),
      externalIdentifiers: r.externalIdentifiers.map((ei) =>
        createExternalIdentifier(ei.source, ei.id),
      ),
      evidence: r.evidence.map((e) => createSourceEvidence(e.source, e.externalId, e.rawTitle)),
    })),
    developers: doc.developers.map((d) => createOrganization(d.name)),
    publishers: doc.publishers.map((p) => createOrganization(p.name)),
    genres: doc.genres.map((g) => createGenre(g.name)),
    externalIdentifiers: doc.externalIdentifiers.map((ei) =>
      createExternalIdentifier(ei.source, ei.id),
    ),
    relationships: doc.relationships.map((r) => ({
      sourceGameId: createGameId(r.sourceGameId),
      targetGameId: createGameId(r.targetGameId),
      type: r.type as
        | 'REMAKE'
        | 'REMASTER'
        | 'ENHANCED_VERSION'
        | 'PORT'
        | 'EXPANSION'
        | 'REGIONAL_RELEASE'
        | 'ALTERNATE_TITLE'
        | 'RELATED_GAME',
    })),
    evidence: doc.evidence.map((e) => createSourceEvidence(e.source, e.externalId, e.rawTitle)),
    classification: doc.classification as Game['classification'],
    completeness: doc.completeness as Game['completeness'],
  };
}

export function toPersistence(game: Game): Record<string, unknown> {
  return {
    domainId: game.id,
    titles: game.titles.map((t) => ({ value: t.value, type: t.type })),
    releases: game.releases.map((r) => ({
      domainId: r.id,
      platform: { name: r.platform.name, family: r.platform.family ?? null, type: r.platform.type },
      region: r.region ? { name: r.region.name } : null,
      releaseDate: r.releaseDate
        ? {
            year: r.releaseDate.year,
            month: r.releaseDate.month,
            day: r.releaseDate.day,
            precision: r.releaseDate.precision,
          }
        : null,
      version: r.version,
      edition: r.edition,
      distributionChannels: r.distributionChannels.map((dc) => ({ name: dc.name })),
      launchers: r.launchers.map((l) => ({ name: l.name })),
      externalIdentifiers: r.externalIdentifiers.map((ei) => ({
        source: ei.source,
        id: ei.id,
      })),
      evidence: r.evidence.map((e) => ({
        source: e.source,
        externalId: e.externalId,
        retrievedAt: e.retrievedAt,
        rawTitle: e.rawTitle,
      })),
    })),
    developers: game.developers.map((d) => ({ name: d.name })),
    publishers: game.publishers.map((p) => ({ name: p.name })),
    genres: game.genres.map((g) => ({ name: g.name })),
    externalIdentifiers: game.externalIdentifiers.map((ei) => ({
      source: ei.source,
      id: ei.id,
    })),
    relationships: game.relationships.map((r) => ({
      sourceGameId: r.sourceGameId,
      targetGameId: r.targetGameId,
      type: r.type,
    })),
    evidence: game.evidence.map((e) => ({
      source: e.source,
      externalId: e.externalId,
      retrievedAt: e.retrievedAt,
      rawTitle: e.rawTitle,
    })),
    classification: game.classification,
    completeness: game.completeness,
  };
}
