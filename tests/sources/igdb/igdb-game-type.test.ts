import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IgdbAdapter } from '../../../src/sources/igdb/igdb-adapter.js';
import { IGDB_OAUTH_TOKEN_RESPONSE } from '../fixtures/source-fixtures.js';

function mockIgdbBodies(responder: (url: string, body: string) => unknown) {
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
    return new Response(JSON.stringify(responder(url, body)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return bodies;
}

function igdbGameResponse(overrides: Record<string, unknown> = {}) {
  return [
    {
      id: 100,
      name: 'Test Game',
      slug: 'test-game',
      platforms: [8],
      ...overrides,
    },
  ];
}

describe('IgdbAdapter game_type/game_status/parent links', () => {
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

  it('requests game_type, status and parent-link fields', async () => {
    const bodies = mockIgdbBodies(() => igdbGameResponse());

    await adapter.search('Test');

    const fields = bodies.find((b) => b.includes('fields ')) ?? '';
    expect(fields).toContain('game_type');
    expect(fields).toContain('status');
    expect(fields).toContain('parent_game');
    expect(fields).toContain('version_parent');
  });

  it('maps remake type, released status and parent links', async () => {
    mockIgdbBodies(() => igdbGameResponse({
      game_type: 8,
      status: 0,
      parent_game: 55,
      version_parent: null,
    }));

    const result = await adapter.search('Test');
    const candidate = result.candidates[0];

    expect(candidate.gameType).toBe('remake');
    expect(candidate.gameStatus).toBe('released');
    expect(candidate.parentGameId).toBe('55');
    expect(candidate.versionParentId).toBeUndefined();
  });

  it('leaves unknown type/status IDs unmapped without inventing names', async () => {
    mockIgdbBodies(() => igdbGameResponse({ game_type: 999, status: 999 }));

    const result = await adapter.search('Test');
    const candidate = result.candidates[0];

    expect(candidate.gameType).toBeUndefined();
    expect(candidate.gameStatus).toBeUndefined();
    expect(candidate.metadata).toMatchObject({
      igdbGameType: 999,
      igdbGameStatus: 999,
    });
  });

  it('omits type/status/parents when upstream does not provide them', async () => {
    mockIgdbBodies(() => igdbGameResponse());

    const result = await adapter.search('Test');
    const candidate = result.candidates[0];

    expect(candidate.gameType).toBeUndefined();
    expect(candidate.gameStatus).toBeUndefined();
    expect(candidate.parentGameId).toBeUndefined();
    expect(candidate.versionParentId).toBeUndefined();
  });

  it('preserves igdb external identity alongside the new fields', async () => {
    mockIgdbBodies(() => igdbGameResponse({ game_type: 0, status: 0 }));

    const result = await adapter.search('Test');
    const candidate = result.candidates[0];

    expect(candidate.sourceId).toBe('100');
    expect(candidate.externalIdentifiers).toEqual([{ source: 'igdb', id: '100' }]);
    expect(candidate.gameType).toBe('main_game');
  });

  it('exposes type/status/parents on getById as well', async () => {
    mockIgdbBodies(() => igdbGameResponse({
      game_type: 9,
      status: 8,
      parent_game: 77,
    }));

    const candidate = await adapter.getById('100');

    expect(candidate?.gameType).toBe('remaster');
    expect(candidate?.gameStatus).toBe('delisted');
    expect(candidate?.parentGameId).toBe('77');
  });
});
