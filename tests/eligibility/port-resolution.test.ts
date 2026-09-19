import { describe, it, expect } from 'vitest';
import { resolvePortParent } from '../../src/eligibility/port-resolution.js';

describe('resolvePortParent', () => {
  it('returns not-port for non-port game types', () => {
    for (const gameType of ['main_game', 'remake', 'remaster', 'dlc_addon', null, undefined, '']) {
      expect(
        resolvePortParent({ gameType, parentGameId: '123', versionParentId: '456' }),
      ).toEqual({ kind: 'not-port' });
    }
  });

  it('selects parent_game when present', () => {
    expect(
      resolvePortParent({ gameType: 'port', parentGameId: '123', versionParentId: '456' }),
    ).toEqual({ kind: 'parent-reference', field: 'parent_game', externalId: '123' });
  });

  it('prefers parent_game over version_parent when both exist', () => {
    const result = resolvePortParent({
      gameType: 'port',
      parentGameId: '123',
      versionParentId: '456',
    });

    expect(result).toEqual({
      kind: 'parent-reference',
      field: 'parent_game',
      externalId: '123',
    });
  });

  it('falls back to version_parent only when parent_game is absent', () => {
    for (const parentGameId of [null, undefined, '', '   ']) {
      expect(
        resolvePortParent({ gameType: 'port', parentGameId, versionParentId: '456' }),
      ).toEqual({ kind: 'parent-reference', field: 'version_parent', externalId: '456' });
    }
  });

  it('returns unresolved when a port has no references', () => {
    for (const ids of [
      { parentGameId: null, versionParentId: null },
      { parentGameId: undefined, versionParentId: undefined },
      { parentGameId: '', versionParentId: '  ' },
    ]) {
      expect(
        resolvePortParent({ gameType: 'port', ...ids }),
      ).toEqual({ kind: 'unresolved', reason: 'MISSING_PARENT_REFERENCE' });
    }
  });

  it('trims reference values and never follows chains', () => {
    // A single reference is returned; the caller performs exactly one
    // lookup. No recursive traversal happens here by construction: the
    // output carries one externalId and no mechanism to continue.
    const result = resolvePortParent({
      gameType: '  port  ',
      parentGameId: '  789  ',
      versionParentId: null,
    });

    expect(result).toEqual({
      kind: 'parent-reference',
      field: 'parent_game',
      externalId: '789',
    });
  });

  it('is deterministic across repeated calls', () => {
    const input = { gameType: 'port', parentGameId: '123', versionParentId: null };
    expect(resolvePortParent(input)).toEqual(resolvePortParent({ ...input }));
  });
});
