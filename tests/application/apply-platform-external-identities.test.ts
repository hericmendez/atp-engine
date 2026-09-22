import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplyPlatformExternalIdentities } from '../../src/application/apply-platform-external-identities.js';
import type { PlatformRepository } from '../../src/application/platform-repository.js';
import type { ATPPlatform } from '../../src/domain/platform/atp-platform.js';
import { createATPPlatform } from '../../src/domain/platform/atp-platform.js';
import type { PlatformMappingEntry } from '../../src/platform-manifest/mobygames-mapping.js';

// Recording fake: exposes ONLY platform operations, so any games or
// quarantine access is structurally impossible for the service.
function createFakePlatformRepository(seed: ATPPlatform[] = []) {
  const store = new Map<string, ATPPlatform>();
  for (const platform of seed) {
    store.set(platform.id, platform);
  }
  const calls: string[] = [];
  const repository: PlatformRepository = {
    save: vi.fn(async (platform: ATPPlatform) => {
      calls.push(`save:${platform.id}`);
      store.set(platform.id, platform);
    }),
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    findBySlug: vi.fn(async (slug: string) =>
      [...store.values()].find((p) => p.slug === slug) ?? null,
    ),
    findByExternalIdentity: vi.fn(async (source: string, sourcePlatformId: number) =>
      [...store.values()].find((p) =>
        p.externalIdentities.some(
          (e) => e.source === source && e.sourcePlatformId === sourcePlatformId,
        ),
      ) ?? null,
    ),
  };
  return { repository, store, calls };
}

const MAPPED_141: PlatformMappingEntry = {
  mobygamesPlatformId: 141,
  atpPlatformId: 'atp-platform-playstation-4',
  status: 'MAPPED',
  evidence: 'deterministic evidence',
};

describe('ApplyPlatformExternalIdentities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1 — applies a valid mapping', async () => {
    const { repository, store } = createFakePlatformRepository([
      createATPPlatform({ name: 'PlayStation 4' }),
    ]);
    const service = new ApplyPlatformExternalIdentities({ platformRepository: repository });

    const summary = await service.apply([MAPPED_141]);

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].result).toBe('APPLIED');
    expect(
      store.get('atp-platform-playstation-4')?.externalIdentities,
    ).toEqual([{ source: 'mobygames', sourcePlatformId: 141 }]);
  });

  it('2/9/11 — ALREADY_PRESENT is idempotent across reruns', async () => {
    const { repository, store } = createFakePlatformRepository([
      createATPPlatform({ name: 'PlayStation 4' }),
    ]);
    const service = new ApplyPlatformExternalIdentities({ platformRepository: repository });

    expect((await service.apply([MAPPED_141])).results[0].result).toBe('APPLIED');
    const second = await service.apply([MAPPED_141]);
    expect(second.results[0].result).toBe('ALREADY_PRESENT');
    expect(store.get('atp-platform-playstation-4')?.externalIdentities).toHaveLength(1);
    expect(vi.mocked(repository.save).mock.calls).toHaveLength(1);
  });

  it('3 — conflicting external identity aborts that mapping', async () => {
    const other = createATPPlatform({ name: 'Other Platform' });
    const { repository } = createFakePlatformRepository([
      createATPPlatform({ name: 'PlayStation 4' }),
      {
        ...other,
        externalIdentities: [{ source: 'mobygames', sourcePlatformId: 141 }],
      },
    ]);
    const service = new ApplyPlatformExternalIdentities({ platformRepository: repository });

    const summary = await service.apply([MAPPED_141]);

    expect(summary.results[0].result).toBe('CONFLICT');
    expect(summary.results[0].detail).toContain('already belongs to');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('4 — missing ATP platform is rejected without creating anything', async () => {
    const { repository, store } = createFakePlatformRepository([]);
    const service = new ApplyPlatformExternalIdentities({ platformRepository: repository });

    const summary = await service.apply([MAPPED_141]);

    expect(summary.results[0].result).toBe('MISSING_ATP_PLATFORM');
    expect(store.size).toBe(0);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('5 — UNRESOLVED rows are never applied', async () => {
    const { repository, store } = createFakePlatformRepository([
      createATPPlatform({ name: 'PlayStation 4' }),
    ]);
    const service = new ApplyPlatformExternalIdentities({ platformRepository: repository });

    const summary = await service.apply([
      { mobygamesPlatformId: 152, status: 'UNRESOLVED', reason: 'NO_ATP_PLATFORM' },
      { manifestName: 'Nintendo Switch 2', status: 'UNRESOLVED', reason: 'NO_MOBYGAMES_PLATFORM_ID' },
    ]);

    expect(summary.results.map((r) => r.result)).toEqual([
      'SKIPPED_UNRESOLVED',
      'SKIPPED_UNRESOLVED',
    ]);
    expect(repository.save).not.toHaveBeenCalled();
    expect(store.get('atp-platform-playstation-4')?.externalIdentities).toEqual([]);
  });

  it('6 — multiple mappings apply independently', async () => {
    const { repository, store } = createFakePlatformRepository([
      createATPPlatform({ name: 'PlayStation 4' }),
      createATPPlatform({ name: '3DO' }),
    ]);
    const service = new ApplyPlatformExternalIdentities({ platformRepository: repository });

    const summary = await service.apply([
      MAPPED_141,
      {
        mobygamesPlatformId: 35,
        atpPlatformId: 'atp-platform-3do',
        status: 'MAPPED',
        evidence: 'e',
      },
      { mobygamesPlatformId: 152, status: 'UNRESOLVED', reason: 'NO_ATP_PLATFORM' },
    ]);

    expect(summary.results.map((r) => r.result)).toEqual([
      'APPLIED',
      'APPLIED',
      'SKIPPED_UNRESOLVED',
    ]);
    expect(store.get('atp-platform-3do')?.externalIdentities).toEqual([
      { source: 'mobygames', sourcePlatformId: 35 },
    ]);
  });

  it('7/8 — touches only the platform repository', async () => {
    const { repository, calls } = createFakePlatformRepository([
      createATPPlatform({ name: 'PlayStation 4' }),
    ]);
    const service = new ApplyPlatformExternalIdentities({ platformRepository: repository });

    await service.apply([MAPPED_141]);
    await service.apply([MAPPED_141]);

    // The service receives no game, quarantine, or pipeline handles:
    // every recorded call is a platform-repository operation, and the
    // only write is the single first-run save.
    expect(calls).toEqual(['save:atp-platform-playstation-4']);
  });

  it('10 — dry-run writes nothing', async () => {
    const { repository, store } = createFakePlatformRepository([
      createATPPlatform({ name: 'PlayStation 4' }),
    ]);
    const service = new ApplyPlatformExternalIdentities({ platformRepository: repository });

    const summary = await service.apply([MAPPED_141], { dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.results[0].result).toBe('APPLIED');
    expect(repository.save).not.toHaveBeenCalled();
    expect(store.get('atp-platform-playstation-4')?.externalIdentities).toEqual([]);
  });

  it('structural errors abort before any write', async () => {
    const { repository } = createFakePlatformRepository([
      createATPPlatform({ name: 'PlayStation 4' }),
    ]);
    const service = new ApplyPlatformExternalIdentities({ platformRepository: repository });

    await expect(
      service.apply([{ status: 'BOGUS' } as unknown as PlatformMappingEntry]),
    ).rejects.toThrow('invalid mapping dataset');
    expect(repository.save).not.toHaveBeenCalled();
  });
});
