/**
 * A rejected discovery candidate preserved for inspection. Quarantined
 * records are debugging/ingestion evidence — never canonical games and
 * never returned by game queries.
 */
export interface QuarantinedCandidate {
  readonly groupId: string;
  readonly source: string;
  readonly sourceId?: string;
  readonly status: 'INELIGIBLE' | 'DEFERRED';
  readonly reason: string;
  readonly blockingReasons: readonly string[];
  readonly classification: string;
  readonly classificationConfidence: number;
  readonly identityConfidence: number;
  readonly sourceCount: number;
  readonly titles: readonly string[];
  readonly retrievedAt: string;
}
