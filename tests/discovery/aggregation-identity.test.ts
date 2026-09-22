import { describe, it, expect } from 'vitest';
import { aggregateAndDeduplicate } from '../../src/discovery/aggregation.js';
import { DeterministicIdentityResolver } from '../../src/identity/deterministic-identity-resolver.js';
import type { DiscoverySourceObservation } from '../../src/discovery/discovery-types.js';

function makeObservation(
  source: string,
  sourceId: string,
  overrides: {
    titles?: string[];
    externalIdentifiers?: { source: string; id: string }[];
  } = {},
): DiscoverySourceObservation {
  return {
    source,
    sourceId,
    candidate: {
      titles: (overrides.titles ?? ['Doom']).map((value) => ({
        value,
        type: 'primary' as const,
      })),
      developers: [{ name: 'id Software' }],
      publishers: [{ name: 'Bethesda' }],
      genres: [],
      releases: [],
      externalIdentifiers: overrides.externalIdentifiers ?? [],
      provenance: {
        source,
        sourceId,
        retrievedAt: new Date().toISOString(),
        rawTitle: 'Doom',
      },
      classificationHints: [],
      description: null,
      coverUrls: [],
    },
    classification: {
      category: 'GAME',
      confidence: 0.9,
      signals: [],
      reason: 'test',
    },
    retrievedAt: new Date().toISOString(),
  };
}

const resolver = new DeterministicIdentityResolver();

describe('aggregateAndDeduplicate identity confidence', () => {
  it('assigns full confidence for exact external-ID matches', async () => {
    const ext = [{ source: 'steam', id: '123' }];
    const groups = await aggregateAndDeduplicate(
      [
        makeObservation('steam', '123', { externalIdentifiers: ext }),
        makeObservation('igdb', '456', {
          titles: ['Doom'],
          externalIdentifiers: ext,
        }),
      ],
      resolver,
      'doom',
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].identityResolution.outcome).toBe('SAME_GAME');
    expect(groups[0].identityResolution.confidence).toBe(1);
  });

  it('derives sub-1.0 confidence for single-source candidates without external IDs', async () => {
    const groups = await aggregateAndDeduplicate(
      [makeObservation('wikipedia', 'wp-1')],
      resolver,
      'doom',
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].identityResolution.outcome).toBe('SAME_GAME');
    expect(groups[0].identityResolution.confidence).toBeLessThan(1);
    expect(groups[0].identityResolution.confidence).toBeGreaterThan(0);
  });

  it('uses the weakest pairwise confidence for multi-source merges', async () => {
    const groups = await aggregateAndDeduplicate(
      [
        makeObservation('wikipedia', 'wp-1', { titles: ['Doom'] }),
        makeObservation('steam', 's-1', { titles: ['Doom'] }),
      ],
      resolver,
      'doom',
    );

    expect(groups).toHaveLength(1);
    // Title-exact match without shared external IDs: strong but not 1.0.
    expect(groups[0].identityResolution.confidence).toBeLessThan(1);
    expect(groups[0].identityResolution.confidence).toBeGreaterThanOrEqual(0.35);
  });

  it('derives (rather than asserts) confidence for single-source groups', async () => {
    // A single observation carries no pairwise evidence: its confidence
    // must come from the resolver, not from an unconditional 1.0. The
    // UNKNOWN eligibility gate additionally requires 2 sources, so a lone
    // candidate can never auto-pass it on identity alone.
    const groups = await aggregateAndDeduplicate(
      [makeObservation('wikipedia', 'wp-9', { titles: ['Mysterious Thing'] })],
      resolver,
      'mysterious thing',
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].identityResolution.confidence).toBeLessThan(1);
    expect(groups[0].observations).toHaveLength(1);
  });
});
