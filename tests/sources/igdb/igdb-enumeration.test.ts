import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IgdbAdapter } from '../../../src/sources/igdb/igdb-adapter.js';
import { IGDB_OAUTH_TOKEN_RESPONSE } from '../fixtures/source-fixtures.js';
import { SourceError } from '../../../src/sources/source-errors.js';

function mockIgdb(responder: (url: string, body: string) => unknown) {
  const bodies: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('id.twitch.tv')) {
      return new Response(JSON.stringify(IGDB_OAUTH_TOKEN_RESPONSE), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const body = typeof init?.body === 'string' ? init.body : '';
    bodies.push(body);
    const payload = responder(url, body);
    if (payload instanceof Response) {
      return payload;
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return bodies;
}

function igdbGame(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Game ${id}`,
    slug: `game-${id}`,
    platforms: [8],
    ...overrides,
  };
}

describe('IgdbAdapter catalog enumeration', () => {
  let adapter: IgdbAdapter;

  beforeEach(() => {
    adapter = new IgdbAdapter({
      source: 'igdb',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests the platform predicate without a text-search clause', async () => {
    const bodies = mockIgdb(() => [igdbGame(1)]);
    const page = await adapter.enumerateByPlatform(8, { limit: 20, offset: 0 });

    expect(page.items).toHaveLength(1);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('where platforms = (8);');
    expect(bodies[0]).not.toContain('search "');
  });

  it('passes limit and a non-zero offset through unchanged', async () => {
    const bodies = mockIgdb(() => [igdbGame(1)]);
    await adapter.enumerateByPlatform(8, { limit: 500, offset: 500 });

    expect(bodies[0]).toContain('limit 500;');
    expect(bodies[0]).toContain('offset 500;');
  });

  it('rejects an oversized limit instead of sending it', async () => {
    mockIgdb(() => []);
    await expect(adapter.enumerateByPlatform(8, { limit: 501, offset: 0 })).rejects.toThrow(
      /limit must be an integer between 1 and 500/,
    );
  });

  it('rejects invalid platform IDs and offsets', async () => {
    mockIgdb(() => []);
    await expect(adapter.enumerateByPlatform(0, { limit: 20, offset: 0 })).rejects.toThrow(
      /platformId must be a positive integer/,
    );
    await expect(adapter.enumerateByPlatform(8, { limit: 20, offset: -1 })).rejects.toThrow(
      /offset must be a non-negative integer/,
    );
  });

  it('requests deterministic id ordering', async () => {
    const bodies = mockIgdb(() => [igdbGame(1)]);
    await adapter.enumerateByPlatform(8, { limit: 20, offset: 0 });

    expect(bodies[0]).toContain('sort id asc;');
  });

  it('requests platform name expansion', async () => {
    const bodies = mockIgdb(() => [igdbGame(1)]);
    await adapter.enumerateByPlatform(8, { limit: 20, offset: 0 });

    expect(bodies[0]).toContain('platforms.name');
  });

  it('prefers expanded platform names and keeps the mapping fallback', async () => {
    const bodies = mockIgdb(() => [
      igdbGame(1, { platforms: [{ id: 8, name: 'PlayStation 2' }] }),
      igdbGame(2, { platforms: [8] }),
    ]);
    void bodies;

    const page = await adapter.enumerateByPlatform(8, { limit: 20, offset: 0 });

    expect(page.items[0].platforms).toEqual(['PlayStation 2']);
    expect(page.items[1].platforms).toEqual(['PlayStation 2']);
  });

  it('drops unknown platform IDs instead of mislabeling them', async () => {
    mockIgdb(() => [igdbGame(1, { platforms: [424242] })]);

    const page = await adapter.enumerateByPlatform(8, { limit: 20, offset: 0 });

    expect(page.items[0].platforms ?? []).toEqual([]);
  });

  it('does not fabricate company roles during enumeration', async () => {
    mockIgdb(() => [igdbGame(1, { involved_companies: [10] })]);

    const page = await adapter.enumerateByPlatform(8, { limit: 20, offset: 0 });

    // Companies resolve later per accepted record; enumeration must not
    // invent roles (nor pay N+1 fetches here).
    expect(page.items[0].developers).toBeUndefined();
    expect(page.items[0].publishers).toBeUndefined();
  });

  it('preserves stable igdb external identity', async () => {
    mockIgdb(() => [igdbGame(4242)]);

    const page = await adapter.enumerateByPlatform(8, { limit: 20, offset: 0 });

    expect(page.items[0].sourceId).toBe('4242');
    expect(page.items[0].externalIdentifiers).toEqual([{ source: 'igdb', id: '4242' }]);
  });

  it('returns empty pages unchanged without persisting anything', async () => {
    mockIgdb(() => []);

    const page = await adapter.enumerateByPlatform(8, { limit: 20, offset: 4000 });

    expect(page.items).toEqual([]);
  });

  it('returns short pages unchanged for the future job to interpret', async () => {
    mockIgdb(() => [igdbGame(1), igdbGame(2)]);

    const page = await adapter.enumerateByPlatform(8, { limit: 500, offset: 4000 });

    expect(page.items).toHaveLength(2);
  });

  it('surfaces provider failures instead of empty pages', async () => {
    mockIgdb(() => new Response('Error', { status: 500 }));

    await expect(adapter.enumerateByPlatform(8, { limit: 20, offset: 0 })).rejects.toThrow(
      SourceError,
    );
  });

  it('maps 429 to rate_limited like other adapter methods', async () => {
    mockIgdb(() => new Response('Limited', { status: 429 }));

    const error = await adapter
      .enumerateByPlatform(8, { limit: 20, offset: 0 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).errorType).toBe('rate_limited');
  });

  it('counts platform scope through /games/count with the same predicate', async () => {
    const bodies = mockIgdb((url) => {
      if (url.includes('/games/count')) {
        return { count: 4218 };
      }
      return [];
    });

    const count = await adapter.countByPlatform(8);

    expect(count).toBe(4218);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('where platforms = (8);');
    expect(bodies[0]).not.toContain('search "');
  });

  it('parses a zero count', async () => {
    mockIgdb(() => ({ count: 0 }));

    await expect(adapter.countByPlatform(8)).resolves.toBe(0);
  });

  it('rejects malformed count responses', async () => {
    mockIgdb(() => ({ unexpected: true }));

    await expect(adapter.countByPlatform(8)).rejects.toThrow(SourceError);
  });
});
