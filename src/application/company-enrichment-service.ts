import type { Game } from '../domain/game/game.js';
import type { IgdbAdapter } from '../sources/igdb/igdb-adapter.js';
import { createOrganization } from '../domain/shared/organization.js';

export interface CompanyEnrichmentServiceDependencies {
  readonly igdbAdapter?: IgdbAdapter;
}

export interface CompanyResult {
  readonly developers: readonly string[] | null;
  readonly publishers: readonly string[] | null;
}

export class CompanyEnrichmentService {
  constructor(private readonly deps: CompanyEnrichmentServiceDependencies) {}

  async enrich(game: Game): Promise<CompanyResult | null> {
    const needsDeveloper = game.developers.length === 0;
    const needsPublisher = game.publishers.length === 0;
    if (!needsDeveloper && !needsPublisher) return null; // fill-only, nothing to do

    if (!this.deps.igdbAdapter) return null;

    try {
      const igdbId = game.externalIdentifiers.find((e) => e.source === 'igdb')?.id;
      if (!igdbId) return null;
      const candidate = await this.deps.igdbAdapter.getById(igdbId);
      if (!candidate) return null;
      const devs = candidate.developers ?? [];
      const pubs = candidate.publishers ?? [];
      // If candidate has no companies, unchanged
      if (devs.length === 0 && pubs.length === 0) return null;

      // Preserve existing roles
      let newDevs: string[] | null = null;
      let newPubs: string[] | null = null;

      if (needsDeveloper && devs.length > 0) {
        // Validate via createOrganization to ensure normalization
        newDevs = devs.map((n) => createOrganization(n).name);
      }
      if (needsPublisher && pubs.length > 0) {
        newPubs = pubs.map((n) => createOrganization(n).name);
      }

      if (!newDevs && !newPubs) return null;
      return { developers: newDevs, publishers: newPubs };
    } catch {
      return null;
    }
  }
}
