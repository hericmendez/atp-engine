import type { Game } from '../domain/game/game.js';
import type { IgdbAdapter } from '../sources/igdb/igdb-adapter.js';
import type { SteamAdapter } from '../sources/steam/steam-adapter.js';
import type { WikipediaAdapter } from '../sources/wikipedia/wikipedia-adapter.js';

export interface DescriptionEnrichmentServiceDependencies {
  readonly igdbAdapter?: IgdbAdapter;
  readonly steamAdapter?: SteamAdapter;
  readonly wikipediaAdapter?: WikipediaAdapter;
}

export interface DescriptionResult {
  readonly description: string | null;
  readonly source: 'igdb' | 'steam' | 'wikipedia' | null;
}

function normalize(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed || !/\S/.test(trimmed)) return null;
  // Steam HTML strip
  const withoutTags = trimmed.replace(/<[^>]*>/g, ' ');
  const decoded = withoutTags
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
  const collapsed = decoded.trim().replace(/\s+/g, ' ');
  if (!collapsed || !/\S/.test(collapsed)) return null;
  return collapsed.slice(0, 5000);
}

export class DescriptionEnrichmentService {
  constructor(private readonly deps: DescriptionEnrichmentServiceDependencies) {}

  async enrich(game: Game): Promise<DescriptionResult> {
    // Fill-only: if already has description, skip
    if (typeof game.description === 'string' && /\S/.test(game.description)) {
      return { description: null, source: null };
    }

    // IGDB first
    if (this.deps.igdbAdapter) {
      try {
        const igdbId = game.externalIdentifiers.find((e) => e.source === 'igdb')?.id;
        if (igdbId) {
          const candidate = await this.deps.igdbAdapter.getById(igdbId);
          const raw = candidate?.description ?? null;
          const norm = normalize(raw);
          if (norm) return { description: norm, source: 'igdb' };
        }
      } catch {
        // fall through to steam
      }
    }

    // Steam second
    if (this.deps.steamAdapter) {
      try {
        // Try steam externalId if exists, else search by title
        let candidate: import('../sources/raw-candidate.js').RawCandidate | null = null;
        const steamId = game.externalIdentifiers.find((e) => e.source === 'steam')?.id;
        if (steamId) {
          candidate = await this.deps.steamAdapter.getById(steamId);
        } else {
          const title = game.titles[0]?.value;
          if (title) {
            const search = await this.deps.steamAdapter.search(title, { limit: 1 });
            candidate = search.candidates[0] ?? null;
          }
        }
        const raw = candidate?.description ?? null;
        const norm = normalize(raw);
        if (norm) return { description: norm, source: 'steam' };
      } catch {
        // fall through
      }
    }

    // Wikipedia third
    if (this.deps.wikipediaAdapter) {
      try {
        const title = game.titles[0]?.value;
        if (title) {
          const search = await this.deps.wikipediaAdapter.search(title, { limit: 1 });
          const candidate = search.candidates[0] ?? null;
          // Wikipedia candidate description is in raw description field
          const raw = candidate?.description ?? null;
          const norm = normalize(raw);
          if (norm) return { description: norm, source: 'wikipedia' };
        }
      } catch {
        // no description
      }
    }

    return { description: null, source: null };
  }
}
