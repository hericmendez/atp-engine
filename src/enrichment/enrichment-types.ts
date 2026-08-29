import type { Game } from '../domain/game/game.js';
import type { MetadataCompleteness } from '../domain/shared/metadata-completeness.js';

export type EnrichmentChangeType =
  'added' | 'improved_precision' | 'conflict_retained_existing' | 'conflict_new_value_skipped';

export type EnrichmentFieldType =
  | 'title'
  | 'developer'
  | 'publisher'
  | 'genre'
  | 'external_identifier'
  | 'evidence'
  | 'release'
  | 'release_date'
  | 'distribution_channel'
  | 'launcher';

export interface EnrichmentChange {
  readonly fieldType: EnrichmentFieldType;
  readonly changeType: EnrichmentChangeType;
  readonly source: string;
  readonly reason: string;
  readonly previousValue: string | null;
  readonly newValue: string | null;
}

export interface EnrichmentConflict {
  readonly fieldType: EnrichmentFieldType;
  readonly sourceA: string;
  readonly valueA: string;
  readonly sourceB: string;
  readonly valueB: string;
  readonly retainedValue: string;
  readonly reason: string;
}

export interface EnrichmentResult {
  readonly game: Game;
  readonly changes: readonly EnrichmentChange[];
  readonly conflicts: readonly EnrichmentConflict[];
  readonly completeness: MetadataCompleteness;
}
