import { describe, it, expect, vi } from 'vitest';
import { PlatformEnrichmentService } from '../src/application/platform-enrichment-service.js';

describe('PlatformEnrichmentService', () => {
  it('IGDB success -> logo PARTIAL', async () => {
    const igdb = {
      postApi: vi.fn(async (endpoint: string) => {
        if (endpoint === '/platforms') return [{ id: 130, name: 'Nintendo Switch', platform_logo: 123 }];
        if (endpoint === '/platform_logos') return [{ image_id: 'abc123' }];
        return [];
      }),
      getAccessToken: vi.fn(async () => 'token'),
    } as unknown as import('../src/sources/igdb/igdb-adapter.js').IgdbAdapter;
    const svc = new PlatformEnrichmentService({ igdbAdapter: igdb, wikipediaFetcher: async () => null });
    const platform = { id: 'nintendo-switch', name: 'Nintendo Switch', company: 'Nintendo', releaseYear: 2017, status: 'active', family: 'Nintendo', type: 'console', thumb: null } as never;
    const res = await svc.enrich(platform);
    expect(res.status).toBe('FOUND_PARTIAL');
    expect(res.logo).toContain('abc123');
    expect(res.logoSource).toBe('igdb');
    expect(res.image).toBe(null);
  });

  it('both found -> COMPLETE', async () => {
    const igdb = {
      postApi: vi.fn(async (endpoint: string) => {
        if (endpoint === '/platforms') return [{ id: 130, name: 'Nintendo Switch', platform_logo: 123 }];
        if (endpoint === '/platform_logos') return [{ image_id: 'abc123' }];
        return [];
      }),
      getAccessToken: vi.fn(async () => 'token'),
    } as unknown as import('../src/sources/igdb/igdb-adapter.js').IgdbAdapter;
    const wiki = vi.fn(async () => 'https://wikipedia.org/thumb.jpg');
    const svc = new PlatformEnrichmentService({ igdbAdapter: igdb, wikipediaFetcher: wiki });
    const platform = { id: 'test', name: 'Nintendo Switch', company: 'Test', releaseYear: null, status: 'active', family: null, type: null, thumb: null } as never;
    const res = await svc.enrich(platform);
    expect(res.status).toBe('FOUND_COMPLETE');
    expect(res.logo).toContain('abc123');
    expect(res.image).toBe('https://wikipedia.org/thumb.jpg');
  });

  it('existing thumb complete -> skip, no fetch', async () => {
    const igdb = { postApi: vi.fn(), getAccessToken: vi.fn() } as unknown as any;
    const wiki = vi.fn(async () => 'https://wikipedia.org/thumb.jpg');
    const svc = new PlatformEnrichmentService({ igdbAdapter: igdb, wikipediaFetcher: wiki });
    const platform = { id: 'ps5', name: 'PlayStation 5', company: 'Sony', releaseYear: 2020, status: 'active', family: 'PlayStation', type: 'console', thumb: { logo: 'https://existing-logo', image: 'https://existing-image' } } as never;
    const res = await svc.enrich(platform);
    expect(res.status).toBe('FOUND_COMPLETE');
    expect(res.logo).toBe(null);
    expect(res.image).toBe(null);
    expect(igdb.postApi).not.toHaveBeenCalled();
    expect(wiki).not.toHaveBeenCalled();
  });

  it('existing logo only -> fetch only image, merge preserves logo', async () => {
    const igdb = { postApi: vi.fn(), getAccessToken: vi.fn() } as unknown as any;
    const wiki = vi.fn(async () => 'https://wikipedia.org/thumb.jpg');
    const svc = new PlatformEnrichmentService({ igdbAdapter: igdb, wikipediaFetcher: wiki });
    const platform = { id: 'ps5', name: 'PlayStation 5', company: 'Sony', releaseYear: 2020, status: 'active', family: 'PlayStation', type: 'console', thumb: { logo: 'https://existing-logo', image: null } } as never;
    const res = await svc.enrich(platform);
    expect(res.status).toBe('FOUND_PARTIAL');
    expect(res.logo).toBe(null);
    expect(res.image).toBe('https://wikipedia.org/thumb.jpg');
    expect(igdb.postApi).not.toHaveBeenCalled();
  });

  it('existing image only -> fetch only logo', async () => {
    const igdb = {
      postApi: vi.fn(async (endpoint: string) => {
        if (endpoint === '/platforms') return [{ id: 1, name: 'Test Platform', platform_logo: 9 }];
        if (endpoint === '/platform_logos') return [{ image_id: 'logo1' }];
        return [];
      }),
      getAccessToken: vi.fn(async () => 'token'),
    } as unknown as any;
    const wiki = vi.fn(async () => 'https://should-not-be-called.jpg');
    const svc = new PlatformEnrichmentService({ igdbAdapter: igdb, wikipediaFetcher: wiki });
    const platform = { id: 'test', name: 'Test Platform', company: 'Test', releaseYear: null, status: 'active', family: null, type: null, thumb: { logo: null, image: 'https://existing-image' } } as never;
    const res = await svc.enrich(platform);
    expect(res.status).toBe('FOUND_PARTIAL');
    expect(res.logo).toContain('logo1');
    expect(res.image).toBe(null);
  });

  it('IGDB no logo -> wikipedia fallback PARTIAL', async () => {
    const igdb = {
      postApi: vi.fn(async (endpoint: string) => {
        if (endpoint === '/platforms') return [{ id: 1, name: 'Test Platform', platform_logo: null }];
        return [];
      }),
      getAccessToken: vi.fn(async () => 'token'),
    } as unknown as any;
    const wiki = vi.fn(async () => 'https://wikipedia.org/thumb.jpg');
    const svc = new PlatformEnrichmentService({ igdbAdapter: igdb, wikipediaFetcher: wiki });
    const platform = { id: 'test', name: 'Test Platform', company: 'Test', releaseYear: null, status: 'active', family: null, type: null, thumb: null } as never;
    const res = await svc.enrich(platform);
    expect(res.status).toBe('FOUND_PARTIAL');
    expect(res.logo).toBe(null);
    expect(res.image).toBe('https://wikipedia.org/thumb.jpg');
    expect(res.imageSource).toBe('wikipedia');
  });

  it('no source -> NOT_FOUND', async () => {
    const svc = new PlatformEnrichmentService({ wikipediaFetcher: async () => null });
    const platform = { id: 'test', name: 'Unknown Platform', company: 'Test', releaseYear: null, status: 'active', family: null, type: null, thumb: null } as never;
    const res = await svc.enrich(platform);
    expect(res.status).toBe('NOT_FOUND');
    expect(res.logo).toBe(null);
    expect(res.image).toBe(null);
  });

  it('conservative matching - no false positive', async () => {
    const igdb = {
      postApi: vi.fn(async () => [{ id: 1, name: 'PlayStation 5 Game', platform_logo: 123 }]),
      getAccessToken: vi.fn(async () => 'token'),
    } as unknown as any;
    const svc = new PlatformEnrichmentService({ igdbAdapter: igdb, wikipediaFetcher: async () => null });
    const platform = { id: 'ps5', name: 'PlayStation 5', company: 'Sony', releaseYear: 2020, status: 'active', family: 'PlayStation', type: 'console', thumb: null } as never;
    const res = await svc.enrich(platform);
    expect(res.status).toBe('NOT_FOUND');
    expect(res.logo).toBe(null);
  });

  it('wikipedia URL normalized (utm removed)', async () => {
    const svc = new PlatformEnrichmentService({ wikipediaFetcher: async () => 'https://upload.wikimedia.org/wikipedia/commons/a.png?utm_source=x&utm_campaign=y' });
    const platform = { id: 'test', name: 'Test Platform', company: 'Test', releaseYear: null, status: 'active', family: null, type: null, thumb: null } as never;
    const res = await svc.enrich(platform);
    expect(res.image).toBe('https://upload.wikimedia.org/wikipedia/commons/a.png');
  });
});
