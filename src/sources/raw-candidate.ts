export interface RawExternalIdentifier {
  readonly source: string;
  readonly id: string;
}

export interface RawClassificationHint {
  readonly category: string;
  readonly confidence: number;
  readonly evidence: string;
}

/**
 * One platform entry of a raw candidate. Plain strings keep working
 * for sources without platform identities (Wikipedia, Steam, manual):
 * only the name travels. Object form additionally carries the
 * provider-scoped identity that produced the name — today only the
 * IGDB adapter emits it (`source: 'igdb'`, numeric provider id as
 * string). Identity is co-located with its name: no positional or
 * fuzzy correlation is ever needed.
 */
export interface RawPlatform {
  readonly name: string;
  readonly source?: string;
  readonly sourceId?: string | number;
}

export interface RawCandidate {
  readonly source: string;
  readonly sourceId: string;

  readonly title?: string;
  readonly alternateTitles?: readonly string[];

  readonly platforms?: readonly (string | RawPlatform)[];
  readonly regions?: readonly string[];

  readonly developers?: readonly string[];
  readonly publishers?: readonly string[];
  readonly genres?: readonly string[];

  readonly releaseDate?: unknown;
  readonly version?: string;
  readonly edition?: string;

  readonly distributionChannels?: readonly string[];
  readonly launchers?: readonly string[];

  readonly externalIdentifiers?: readonly RawExternalIdentifier[];

  /**
   * Provider-declared game type/status (e.g. IGDB `game_type` /
   * `game_status` names). Transport only — policy evaluation happens
   * downstream. Absent when the source does not provide them.
   */
  readonly gameType?: string;
  readonly gameStatus?: string;

  /**
   * Provider parent references (e.g. IGDB `parent_game` /
   * `version_parent` IDs, as strings). Ingest-time evidence for future
   * port-parent resolution. Absent when not provided.
   */
  readonly parentGameId?: string;
  readonly versionParentId?: string;

  readonly description?: string;
  readonly classificationHints?: readonly RawClassificationHint[];

  readonly coverUrls?: readonly string[];

  readonly metadata?: Record<string, unknown>;
}
