import { describe, it, expect, vi } from 'vitest';
import { CompanyEnrichmentService } from '../src/application/company-enrichment-service.js';
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

describe('CompanyEnrichmentService', () => {
  it('ambos vazios → preenche ambos', async () => {
    const igdb = { getById: vi.fn(async () => ({ developers: ['A','B'], publishers: ['C'] })) } as unknown as any;
    const svc = new CompanyEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ developers: [], publishers: [], externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res?.developers).toEqual(['A','B']);
    expect(res?.publishers).toEqual(['C']);
  });
  it('developer existente + publisher vazio → preserva developer', async () => {
    const igdb = { getById: vi.fn(async () => ({ developers: ['Other'], publishers: ['Publisher'] })) } as unknown as any;
    const svc = new CompanyEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ developers: [{ name: 'Existing' } as never], publishers: [], externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res?.developers).toBeNull();
    expect(res?.publishers).toEqual(['Publisher']);
  });
  it('publisher existente + developer vazio → preserva publisher', async () => {
    const igdb = { getById: vi.fn(async () => ({ developers: ['Dev'], publishers: ['Other'] })) } as unknown as any;
    const svc = new CompanyEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ developers: [], publishers: [{ name: 'Existing' } as never], externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res?.developers).toEqual(['Dev']);
    expect(res?.publishers).toBeNull();
  });
  it('ambos existentes → no-op', async () => {
    const igdb = { getById: vi.fn(async () => ({ developers: ['A'], publishers: ['B'] })) } as unknown as any;
    const svc = new CompanyEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ developers: [{ name: 'A' } as never], publishers: [{ name: 'B' } as never], externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res).toBeNull();
  });
  it('IGDB sem involved -> null', async () => {
    const igdb = { getById: vi.fn(async () => ({ developers: [], publishers: [] })) } as unknown as any;
    const svc = new CompanyEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res).toBeNull();
  });
  it('multiplos developers', async () => {
    const igdb = { getById: vi.fn(async () => ({ developers: ['A','B','C'], publishers: [] })) } as unknown as any;
    const svc = new CompanyEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res?.developers).toEqual(['A','B','C']);
  });
  it('mesma company como dev e pub', async () => {
    const igdb = { getById: vi.fn(async () => ({ developers: ['Nintendo'], publishers: ['Nintendo'] })) } as unknown as any;
    const svc = new CompanyEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res?.developers).toEqual(['Nintendo']);
    expect(res?.publishers).toEqual(['Nintendo']);
  });
  it('falha IGDB -> null sem corrupção', async () => {
    const igdb = { getById: vi.fn(async () => { throw new Error('down'); }) } as unknown as any;
    const svc = new CompanyEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res).toBeNull();
  });
  it('Organization factory', async () => {
    const igdb = { getById: vi.fn(async () => ({ developers: ['  Nintendo  '], publishers: [] })) } as unknown as any;
    const svc = new CompanyEnrichmentService({ igdbAdapter: igdb });
    const game = makeGame({ externalIdentifiers: [{ source: 'igdb', id: '1' } as never] });
    const res = await svc.enrich(game);
    expect(res?.developers?.[0]).toBe('Nintendo');
  });
});
