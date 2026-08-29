export interface RawExternalIdentifier {
  readonly source: string;
  readonly id: string;
}

export interface RawClassificationHint {
  readonly category: string;
  readonly confidence: number;
  readonly evidence: string;
}

export interface RawCandidate {
  readonly source: string;
  readonly sourceId: string;

  readonly title?: string;
  readonly alternateTitles?: readonly string[];

  readonly platforms?: readonly string[];
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

  readonly description?: string;
  readonly classificationHints?: readonly RawClassificationHint[];

  readonly coverUrls?: readonly string[];

  readonly metadata?: Record<string, unknown>;
}
