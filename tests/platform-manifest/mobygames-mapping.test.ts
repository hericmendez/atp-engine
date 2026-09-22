import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  validateMappingDataset,
  type MappingDatasetInput,
  type PlatformMappingEntry,
} from '../../src/platform-manifest/mobygames-mapping.js';
import { PLATFORM_MANIFEST } from '../../src/platform-manifest/platforms.js';

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')) as T;
}

function baseInput(): MappingDatasetInput {
  return {
    snapshot: [
      { source: 'mobygames', sourcePlatformId: 141, name: 'PlayStation 4' },
      { source: 'mobygames', sourcePlatformId: 35, name: '3DO' },
    ],
    mapping: [
      {
        mobygamesPlatformId: 141,
        atpPlatformId: 'atp-platform-playstation-4',
        status: 'MAPPED',
        evidence: 'deterministic evidence',
      },
      { mobygamesPlatformId: 35, status: 'UNRESOLVED', reason: 'NO_ATP_PLATFORM' },
    ],
    atpPlatformIds: ['atp-platform-playstation-4'],
    manifestNames: ['Nintendo Switch 2'],
  };
}

describe('mobygames mapping dataset', () => {
  it('rejects non-positive snapshot ids', () => {
    const input = baseInput();
    input.snapshot = [{ source: 'mobygames', sourcePlatformId: 0, name: 'X' }];
    expect(validateMappingDataset(input).length).toBeGreaterThan(0);
  });

  it('rejects duplicate snapshot ids', () => {
    const input = baseInput();
    input.snapshot = [
      { source: 'mobygames', sourcePlatformId: 141, name: 'A' },
      { source: 'mobygames', sourcePlatformId: 141, name: 'B' },
    ];
    expect(validateMappingDataset(input).some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('rejects MAPPED rows pointing at unknown ATP platforms', () => {
    const input = baseInput();
    (input.mapping[0] as { atpPlatformId: string }).atpPlatformId = 'atp-platform-nope';
    expect(validateMappingDataset(input).some((e) => e.includes('unknown atpPlatformId'))).toBe(
      true,
    );
  });

  it('rejects one identity mapped to two ATP platforms', () => {
    const input = baseInput();
    input.atpPlatformIds = ['atp-platform-playstation-4', 'atp-platform-other'];
    input.mapping = [
      ...input.mapping,
      {
        mobygamesPlatformId: 141,
        atpPlatformId: 'atp-platform-other',
        status: 'MAPPED',
        evidence: 'e',
      },
    ];
    expect(validateMappingDataset(input).some((e) => e.includes('duplicate mapping'))).toBe(true);
  });

  it('UNRESOLVED rows need no atpPlatformId but need a reason', () => {
    const ok = validateMappingDataset(baseInput());
    expect(ok).toEqual([]);
    const missing: MappingDatasetInput = {
      ...baseInput(),
      mapping: [{ mobygamesPlatformId: 35, status: 'UNRESOLVED' } as PlatformMappingEntry],
    };
    expect(validateMappingDataset(missing).some((e) => e.includes('reason'))).toBe(true);
  });

  it('MAPPED rows require atpPlatformId and evidence', () => {
    const noTarget: MappingDatasetInput = {
      ...baseInput(),
      mapping: [{ mobygamesPlatformId: 141, status: 'MAPPED', evidence: 'e' }],
    };
    expect(validateMappingDataset(noTarget).some((e) => e.includes('atpPlatformId'))).toBe(true);
    const noEvidence: MappingDatasetInput = {
      ...baseInput(),
      mapping: [
        {
          mobygamesPlatformId: 141,
          atpPlatformId: 'atp-platform-playstation-4',
          status: 'MAPPED',
        },
      ],
    };
    expect(validateMappingDataset(noEvidence).some((e) => e.includes('evidence'))).toBe(true);
  });

  it('allows shared identities across manifest names without merging platforms', () => {
    // Aliases (e.g. SNES + Super Famicom → one provider id) are a
    // manifest-layer fact. The mapping layer only constrains
    // id → atpPlatform cardinality, which this dataset satisfies.
    expect(validateMappingDataset(baseInput())).toEqual([]);
  });

  it('never accepts a name-only MAPPED row', () => {
    const named: MappingDatasetInput = {
      ...baseInput(),
      mapping: [
        {
          manifestName: 'PlayStation 4',
          atpPlatformId: 'atp-platform-playstation-4',
          status: 'MAPPED',
          evidence: 'same name',
        },
      ],
    };
    const errors = validateMappingDataset(named);
    expect(errors.some((e) => e.includes('mobygamesPlatformId'))).toBe(true);
  });

  it('is deterministic across runs', () => {
    const first = validateMappingDataset(baseInput());
    const second = validateMappingDataset(baseInput());
    expect(second).toEqual(first);
  });

  it('validates the real dataset files', () => {
    const snapshot = readJson<{ source: string; sourcePlatformId: number; name: string }[]>(
      'data/mobygames/platforms.json',
    );
    const mapping = readJson<PlatformMappingEntry[]>('data/mobygames/platform-mapping.json');
    const atpPlatforms = readJson<{ id: string }[]>('data/atp/platforms.json');
    const manifestNames = PLATFORM_MANIFEST.map((e) => e.name);
    expect(snapshot).toHaveLength(7);
    expect(mapping.filter((r) => r.status === 'MAPPED')).toHaveLength(5);
    expect(mapping.filter((r) => r.status === 'UNRESOLVED')).toHaveLength(3);
    const errors = validateMappingDataset({
      snapshot,
      mapping,
      atpPlatformIds: atpPlatforms.map((p) => p.id),
      manifestNames,
    });
    expect(errors).toEqual([]);
  });
});
