export type IdentitySignalSource =
  | 'external-id-match'
  | 'external-id-mismatch'
  | 'title-exact-match'
  | 'title-normalized-match'
  | 'title-similar'
  | 'title-different'
  | 'version-marker-detected'
  | 'remake-marker-detected'
  | 'release-date-match'
  | 'release-date-different'
  | 'developer-match'
  | 'developer-different'
  | 'publisher-match'
  | 'publisher-different'
  | 'platform-compatible'
  | 'region-compatible'
  | 'description-similar';

export interface IdentitySignal {
  readonly source: IdentitySignalSource;
  readonly weight: number;
  readonly confidence: number;
  readonly evidence: string;
}
