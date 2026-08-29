import type { ExternalIdentifier } from './external-identifier.js';

export interface SourceEvidence {
  readonly source: string;
  readonly externalId: string;
  readonly retrievedAt: Date;
  readonly rawTitle: string | null;
}

export function createSourceEvidence(
  source: string,
  externalId: string,
  rawTitle: string | null = null,
): SourceEvidence {
  if (!source || source.trim().length === 0) {
    throw new Error('SourceEvidence source must not be empty');
  }
  if (!externalId || externalId.trim().length === 0) {
    throw new Error('SourceEvidence externalId must not be empty');
  }
  return {
    source: source.trim(),
    externalId: externalId.trim(),
    retrievedAt: new Date(),
    rawTitle,
  };
}

export function sourceEvidenceToExternalIdentifier(evidence: SourceEvidence): ExternalIdentifier {
  return { source: evidence.source, id: evidence.externalId };
}
