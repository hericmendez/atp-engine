export interface WikipediaCoverCandidate {
  readonly pageId: number;
  readonly title: string;
  readonly imageUrl: string;
  readonly imageWidth: number | null;
  readonly imageHeight: number | null;
  readonly relevanceScore: number;
  readonly validationSignals: WikipediaValidationSignals;
}

export interface WikipediaValidationSignals {
  readonly hasInfobox: boolean;
  readonly hasDeveloper: boolean;
  readonly hasPublisher: boolean;
  readonly hasPlatform: boolean;
  readonly hasGenre: boolean;
  readonly hasReleaseDate: boolean;
  readonly isVideoGame: boolean;
  readonly confidence: number;
}

export interface WikipediaCoverDiscoveryResult {
  readonly candidates: readonly WikipediaCoverCandidate[];
  readonly errors: readonly WikipediaCoverDiscoveryError[];
}

export interface WikipediaCoverDiscoveryError {
  readonly source: string;
  readonly errorType: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface WikipediaSearchPage {
  readonly pageid: number;
  readonly title: string;
  readonly snippet: string;
  readonly wordcount: number;
}

export interface WikipediaPageParse {
  readonly pageid: number;
  readonly title: string;
  readonly wikitext?: { readonly '*': string };
  readonly categories?: readonly { readonly '*': string }[];
}

export interface WikipediaPageImage {
  readonly thumbnail?: { readonly source: string };
  readonly original?: { readonly source: string };
}
