import { describe, it, expect, vi } from 'vitest';
import { PlatformEnrichmentRunner } from '../src/application/platform-enrichment-runner.js';
import { PlatformEnrichmentService } from '../src/application/platform-enrichment-service.js';
import { PlatformCatalogModel } from '../src/infrastructure/persistence/mongodb/platform-catalog-schema.js';

function platformDoc(overrides: Record<string, unknown>) {
  return {
    platformId: 'test',
    name: 'Test',
    company: 'TestCo',
    releaseYear: null,
    status: 'active',
    family: null,
    type: null,
    thumb: null,
    ...overrides,
  };
}

describe('PlatformEnrichmentRunner', () => {
  it('processamento em batch com merge logo+image', async () => {
    const docs = [
      platformDoc({ platformId: 'ps5', name: 'PlayStation 5', thumb: null }),
      platformDoc({ platformId: 'xbox', name: 'Xbox Series X', thumb: null }),
    ];
    vi.spyOn(PlatformCatalogModel, 'countDocuments').mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    vi.spyOn(PlatformCatalogModel, 'find').mockReturnValue({ lean: vi.fn(async () => docs) } as never);
    const service = { enrich: vi.fn(async () => ({ logo: 'https://img-logo', image: null, logoSource: 'igdb', imageSource: null, status: 'FOUND_PARTIAL' as const })) } as unknown as PlatformEnrichmentService;
    const upsert = vi.fn(async () => {});
    const repo = { upsert } as unknown as import('../src/domain/platform/platform-catalog-repository.js').PlatformCatalogRepository;
    const runner = new PlatformEnrichmentRunner(repo as never, service);
    // avoid real delay? keep 250ms x2 acceptable
    const result = await runner.run();
    expect(result.processed).toBe(2);
    expect(result.igdb).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'ps5', thumb: { logo: 'https://img-logo', image: null } }));
    vi.restoreAllMocks();
  });

  it('plataformas complete são ignoradas', async () => {
    const docs = [
      platformDoc({ platformId: 'ps5', name: 'PlayStation 5', thumb: { logo: 'https://l', image: 'https://i' } }),
    ];
    vi.spyOn(PlatformCatalogModel, 'countDocuments').mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    vi.spyOn(PlatformCatalogModel, 'find').mockReturnValue({ lean: vi.fn(async () => docs) } as never);
    const service = { enrich: vi.fn() } as unknown as PlatformEnrichmentService;
    const upsert = vi.fn(async () => {});
    const repo = { upsert } as unknown as never;
    const runner = new PlatformEnrichmentRunner(repo, service);
    await runner.run();
    expect(service.enrich).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('idempotência: partial pode ser completado com merge', async () => {
    const docs = [
      platformDoc({ platformId: 'ps5', name: 'PlayStation 5', thumb: { logo: 'https://existing-logo', image: null } }),
    ];
    vi.spyOn(PlatformCatalogModel, 'countDocuments').mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    vi.spyOn(PlatformCatalogModel, 'find').mockReturnValue({ lean: vi.fn(async () => docs) } as never);
    const service = { enrich: vi.fn(async () => ({ logo: null, image: 'https://new-image', logoSource: null, imageSource: 'wikipedia', status: 'FOUND_PARTIAL' as const })) } as unknown as PlatformEnrichmentService;
    const upsert = vi.fn(async () => {});
    const repo = { upsert } as unknown as never;
    const runner = new PlatformEnrichmentRunner(repo, service);
    const result = await runner.run();
    expect(result.processed).toBe(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ thumb: { logo: 'https://existing-logo', image: 'https://new-image' } }));
    vi.restoreAllMocks();
  });

  it('falha em uma plataforma não interrompe demais', async () => {
    const docs = [
      platformDoc({ platformId: 'fail', name: 'Fail Platform', thumb: null }),
      platformDoc({ platformId: 'ok', name: 'OK Platform', thumb: null }),
    ];
    vi.spyOn(PlatformCatalogModel, 'countDocuments').mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    vi.spyOn(PlatformCatalogModel, 'find').mockReturnValue({ lean: vi.fn(async () => docs) } as never);
    const service = {
      enrich: vi.fn(async (p: { name: string }) => {
        if (p.name === 'Fail Platform') throw new Error('IGDB error');
        return { logo: 'https://img', image: null, logoSource: 'igdb', imageSource: null, status: 'FOUND_PARTIAL' as const };
      }),
    } as unknown as PlatformEnrichmentService;
    const upsert = vi.fn(async () => {});
    const repo = { upsert } as unknown as never;
    const runner = new PlatformEnrichmentRunner(repo, service);
    const result = await runner.run();
    expect(result.errors).toBe(1);
    expect(result.processed).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('contabilização correta logo/image/notFound', async () => {
    const docs = [
      platformDoc({ platformId: '1', name: 'IGDB Platform', thumb: null }),
      platformDoc({ platformId: '2', name: 'Wiki Platform', thumb: null }),
      platformDoc({ platformId: '3', name: 'No Platform', thumb: null }),
    ];
    vi.spyOn(PlatformCatalogModel, 'countDocuments').mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    vi.spyOn(PlatformCatalogModel, 'find').mockReturnValue({ lean: vi.fn(async () => docs) } as never);
    const service = {
      enrich: vi.fn(async (p: { name: string }) => {
        if (p.name === 'IGDB Platform') return { logo: 'https://igdb', image: null, logoSource: 'igdb', imageSource: null, status: 'FOUND_PARTIAL' as const };
        if (p.name === 'Wiki Platform') return { logo: null, image: 'https://wiki', logoSource: null, imageSource: 'wikipedia', status: 'FOUND_PARTIAL' as const };
        return { logo: null, image: null, logoSource: null, imageSource: null, status: 'NOT_FOUND' as const };
      }),
    } as unknown as PlatformEnrichmentService;
    const repo = { upsert: vi.fn(async () => {}) } as unknown as never;
    const runner = new PlatformEnrichmentRunner(repo, service);
    const result = await runner.run();
    expect(result.igdb).toBe(1);
    expect(result.wikipedia).toBe(1);
    expect(result.notFound).toBe(1);
    vi.restoreAllMocks();
  });

  it('nunca persiste objeto vazio', async () => {
    const docs = [platformDoc({ platformId: '1', name: 'No Platform', thumb: null })];
    vi.spyOn(PlatformCatalogModel, 'countDocuments').mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    vi.spyOn(PlatformCatalogModel, 'find').mockReturnValue({ lean: vi.fn(async () => docs) } as never);
    const service = { enrich: vi.fn(async () => ({ logo: null, image: null, logoSource: null, imageSource: null, status: 'NOT_FOUND' as const })) } as unknown as PlatformEnrichmentService;
    const upsert = vi.fn(async () => {});
    const repo = { upsert } as unknown as never;
    const runner = new PlatformEnrichmentRunner(repo, service);
    const result = await runner.run();
    expect(result.notFound).toBe(1);
    expect(upsert).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
