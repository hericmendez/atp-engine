import { describe, it, expect, vi } from 'vitest';
import { DescriptionEnrichmentService } from '../src/application/description-enrichment-service.js';
import { createGame } from '../src/domain/game/game.js';
import { createGameId } from '../src/domain/shared/ids.js';
import { createGameTitle } from '../src/domain/shared/title.js';

function makeGame(overrides: Partial<import('../src/domain/game/game.js').Game> = {}) {
  return createGame({
    id: createGameId('test-game'),
    titles: [createGameTitle('Test Game', 'primary')],
    developers: [],
    publishers: [],
    genres: [],
    externalIdentifiers: [],
    classification: 'GAME',
    completeness: 'FOUND_PARTIAL',
    ...overrides,
  });
}

describe('DescriptionEnrichmentService', () => {
  it('IGDB returns description', async () => {
    const igdb = { getById: vi.fn(async () => ({ description: '  IGDB   summary  ' })) } as unknown as import('../src/sources/igdb/igdb-adapter.js').IgdbAdapter;
    const svc = new DescriptionEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ externalIdentifiers: [{ source: 'igdb', id: '123' } as never], description: null });
    const res = await svc.enrich(game);
    expect(res.description).toBe('IGDB summary');
    expect(res.source).toBe('igdb');
  });

  it('IGDB empty -> Steam', async () => {
    const igdb = { getById: vi.fn(async () => ({ description: '' })) } as unknown as any;
    const steam = { getById: vi.fn(async () => ({ description: 'Steam desc' })), search: vi.fn(async () => ({ candidates: [] })) } as unknown as any;
    const svc = new DescriptionEnrichmentService({ igdbAdapter: igdb, steamAdapter: steam });
    const game = makeGame({ externalIdentifiers: [{ source: 'igdb', id: '123' } as never, { source: 'steam', id: '456' } as never], description: null });
    const res = await svc.enrich(game);
    expect(res.description).toBe('Steam desc');
    expect(res.source).toBe('steam');
  });

  it('IGDB fail -> Steam', async () => {
    const igdb = { getById: vi.fn(async () => { throw new Error('igdb down'); }) } as unknown as any;
    const steam = { getById: vi.fn(async () => ({ description: 'Steam ok' })), search: vi.fn(async () => ({ candidates: [] })) } as unknown as any;
    const svc = new DescriptionEnrichmentService({ igdbAdapter: igdb, steamAdapter: steam });
    const game = makeGame({ externalIdentifiers: [{ source: 'igdb', id: '123' } as never, { source: 'steam', id: '456' } as never], description: null });
    const res = await svc.enrich(game);
    expect(res.description).toBe('Steam ok');
  });

  it('Steam HTML stripped', async () => {
    const steam = { getById: vi.fn(async () => ({ description: '<b>Hi</b> &amp; <br> test' })), search: vi.fn(async () => ({ candidates: [] })) } as unknown as any;
    const svc = new DescriptionEnrichmentService({ steamAdapter: steam });
    const game = makeGame({ description: null, externalIdentifiers: [{ source: 'steam', id: '456' } as never] });
    const res = await svc.enrich(game);
    expect(res.description).toBe('Hi & test');
  });

  it('Wikipedia fallback', async () => {
    const igdb = { getById: vi.fn(async () => ({ description: null })) } as unknown as any;
    const steam = { getById: vi.fn(async () => null), search: vi.fn(async () => ({ candidates: [] })) } as unknown as any;
    const wiki = { search: vi.fn(async () => ({ candidates: [{ description: 'Wiki desc' }] })) } as unknown as any;
    const svc = new DescriptionEnrichmentService({ igdbAdapter: igdb, steamAdapter: steam, wikipediaAdapter: wiki });
    const game = makeGame({ description: null });
    const res = await svc.enrich(game);
    expect(res.source).toBe('wikipedia');
    expect(res.description).toBe('Wiki desc');
  });

  it('all miss -> null', async () => {
    const igdb = { getById: vi.fn(async () => null) } as unknown as any;
    const svc = new DescriptionEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ description: null });
    const res = await svc.enrich(game);
    expect(res.description).toBeNull();
  });

  it('fill-only existing description unchanged', async () => {
    const igdb = { getById: vi.fn(async () => ({ description: 'new' })) } as unknown as any;
    const svc = new DescriptionEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ description: 'existing' });
    const res = await svc.enrich(game);
    expect(res.description).toBeNull();
  });

  it('whitespace description considered missing', async () => {
    const igdb = { getById: vi.fn(async () => ({ description: 'new' })) } as unknown as any;
    const svc = new DescriptionEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ description: '   ', externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res.description).toBe('new');
  });

  it('normalization collapse whitespace and slice', async () => {
    const igdb = { getById: vi.fn(async () => ({ description: '  a   b\n\nc  ' })) } as unknown as any;
    const svc = new DescriptionEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ description: null, externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res.description).toBe('a b c');
  });

  it('precedence IGDB over Steam', async () => {
    const igdb = { getById: vi.fn(async () => ({ description: 'igdb' })) } as unknown as any;
    const steam = { getById: vi.fn(async () => ({ description: 'steam' })), search: vi.fn(async () => ({ candidates: [] })) } as unknown as any;
    const svc = new DescriptionEnrichmentService({ igdbAdapter: igdb, steamAdapter: steam });
    const game = makeGame({ externalIdentifiers: [{ source: 'igdb', id: '1' } as never], description: null });
    const res = await svc.enrich(game);
    expect(res.source).toBe('igdb');
    expect(steam.getById).not.toHaveBeenCalled();
  });
});
