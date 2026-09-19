import { describe, it, expect } from 'vitest';
import {
  CatalogPolicyDecision,
  evaluateCatalogPolicy,
} from '../../src/eligibility/game-type-policy.js';

describe('evaluateCatalogPolicy game_type matrix', () => {
  it.each([
    ['main_game'],
    ['standalone_expansion'],
    ['remake'],
    ['remaster'],
    ['expanded_game'],
  ])('canonical type %s with released status is CANONICAL', (gameType) => {
    const result = evaluateCatalogPolicy({ gameType, gameStatus: 'released' });

    expect(result.decision).toBe(CatalogPolicyDecision.CANONICAL);
    expect(result.gameType).toBe(gameType);
    expect(result.gameStatus).toBe('released');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it.each([
    ['dlc_addon'],
    ['bundle'],
    ['mod'],
    ['episode'],
    ['season'],
    ['fork'],
    ['pack'],
    ['update'],
  ])('excluded type %s with released status is QUARANTINE', (gameType) => {
    const result = evaluateCatalogPolicy({ gameType, gameStatus: 'released' });

    expect(result.decision).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('port with released status is PORT, never canonical', () => {
    const result = evaluateCatalogPolicy({ gameType: 'port', gameStatus: 'released' });

    expect(result.decision).toBe(CatalogPolicyDecision.PORT);
  });

  it('expansion with released status is REVIEW_REQUIRED, never inferred', () => {
    const result = evaluateCatalogPolicy({ gameType: 'expansion', gameStatus: 'released' });

    expect(result.decision).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
  });

  it('unknown gameType is REVIEW_REQUIRED, never silently canonical', () => {
    for (const gameType of [' directors_cut', 'unknown_type', '']) {
      const result = evaluateCatalogPolicy({ gameType, gameStatus: 'released' });

      expect(result.decision).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
    }
  });

  it('missing gameType is REVIEW_REQUIRED', () => {
    for (const gameType of [null, undefined]) {
      const result = evaluateCatalogPolicy({ gameType, gameStatus: 'released' });

      expect(result.decision).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
    }
  });
});

describe('evaluateCatalogPolicy game_status matrix', () => {
  it.each([['released'], ['announced'], ['upcoming'], ['delisted']])(
    'main_game with status %s is CANONICAL',
    (gameStatus) => {
      const result = evaluateCatalogPolicy({ gameType: 'main_game', gameStatus });

      expect(result.decision).toBe(CatalogPolicyDecision.CANONICAL);
    },
  );

  it.each([['cancelled'], ['rumored'], ['dead']])(
    'main_game with status %s is QUARANTINE',
    (gameStatus) => {
      const result = evaluateCatalogPolicy({ gameType: 'main_game', gameStatus });

      expect(result.decision).toBe(CatalogPolicyDecision.QUARANTINE);
    },
  );

  it('delisted preserves eligibility with reason intact', () => {
    const result = evaluateCatalogPolicy({ gameType: 'remake', gameStatus: 'delisted' });

    expect(result.decision).toBe(CatalogPolicyDecision.CANONICAL);
    expect(result.gameStatus).toBe('delisted');
  });

  it('unknown or missing status downgrades canonical types to review', () => {
    for (const gameStatus of ['alpha', 'beta', 'early_access', 'offline', 'some_future_state', '', null, undefined]) {
      const result = evaluateCatalogPolicy({ gameType: 'main_game', gameStatus });

      expect(result.decision).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
    }
  });

  it('dead status quarantines even an otherwise admissible type', () => {
    const result = evaluateCatalogPolicy({ gameType: 'remake', gameStatus: 'cancelled' });

    expect(result.decision).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('excluded types stay QUARANTINE regardless of status', () => {
    const result = evaluateCatalogPolicy({ gameType: 'dlc_addon', gameStatus: 'cancelled' });

    expect(result.decision).toBe(CatalogPolicyDecision.QUARANTINE);
  });
});

describe('evaluateCatalogPolicy required combinations', () => {
  it('main_game + released → CANONICAL', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: 'released' }).decision,
    ).toBe(CatalogPolicyDecision.CANONICAL);
  });

  it('main_game + delisted → CANONICAL', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: 'delisted' }).decision,
    ).toBe(CatalogPolicyDecision.CANONICAL);
  });

  it('port + released → PORT', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'port', gameStatus: 'released' }).decision,
    ).toBe(CatalogPolicyDecision.PORT);
  });

  it('dlc + released → QUARANTINE', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'dlc_addon', gameStatus: 'released' }).decision,
    ).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('bundle + released → QUARANTINE', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'bundle', gameStatus: 'released' }).decision,
    ).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('episode + released → QUARANTINE', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'episode', gameStatus: 'released' }).decision,
    ).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('expansion + released → REVIEW_REQUIRED', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'expansion', gameStatus: 'released' }).decision,
    ).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
  });

  it('main_game + cancelled → QUARANTINE', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: 'cancelled' }).decision,
    ).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('main_game + rumored → QUARANTINE', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: 'rumored' }).decision,
    ).toBe(CatalogPolicyDecision.QUARANTINE);
  });
});

describe('evaluateCatalogPolicy purity and determinism', () => {
  it('is deterministic across repeated calls', () => {
    const input = { gameType: 'remake', gameStatus: 'released' };
    const first = evaluateCatalogPolicy(input);
    const second = evaluateCatalogPolicy({ ...input });

    expect(second).toEqual(first);
  });

  it('echoes normalized inputs for quarantine/sync accounting', () => {
    const result = evaluateCatalogPolicy({ gameType: '  port  ', gameStatus: 'released' });

    expect(result.decision).toBe(CatalogPolicyDecision.PORT);
    expect(result.gameType).toBe('port');
    expect(result.gameStatus).toBe('released');
  });

  it('performs no I/O (synchronous pure function)', () => {
    const result = evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: 'released' });

    expect(result).not.toBeInstanceOf(Promise);
    expect(result.decision).toBe(CatalogPolicyDecision.CANONICAL);
  });
});

describe('evaluateCatalogPolicy release-date evidence (status absent)', () => {
  const past = { year: 2014, month: 2, day: 25, precision: 'day' as const };
  const future = { year: 2100, month: 1, day: 1, precision: 'day' as const };

  it('main_game + status=null + past releaseDate is CANONICAL', () => {
    const result = evaluateCatalogPolicy({
      gameType: 'main_game',
      gameStatus: null,
      releaseDate: past,
    });

    expect(result.decision).toBe(CatalogPolicyDecision.CANONICAL);
    // The status itself is never rewritten — only the decision changes.
    expect(result.gameStatus).toBeNull();
  });

  it('main_game + status=null + future releaseDate is REVIEW_REQUIRED', () => {
    const result = evaluateCatalogPolicy({
      gameType: 'main_game',
      gameStatus: null,
      releaseDate: future,
    });

    expect(result.decision).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
  });

  it('main_game + status=null + absent releaseDate is REVIEW_REQUIRED', () => {
    const result = evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: null });

    expect(result.decision).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
  });

  it('main_game + delisted is CANONICAL regardless of evidence', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: 'delisted' }).decision,
    ).toBe(CatalogPolicyDecision.CANONICAL);
    expect(
      evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: 'delisted', releaseDate: past })
        .decision,
    ).toBe(CatalogPolicyDecision.CANONICAL);
  });

  it('main_game + cancelled is QUARANTINE regardless of evidence', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: 'cancelled', releaseDate: past })
        .decision,
    ).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('main_game + rumored is QUARANTINE regardless of evidence', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: 'rumored', releaseDate: past })
        .decision,
    ).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('DLC + past releaseDate stays QUARANTINE (date never overrides type)', () => {
    const result = evaluateCatalogPolicy({
      gameType: 'dlc_addon',
      gameStatus: null,
      releaseDate: past,
    });

    expect(result.decision).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('bundle + past releaseDate stays QUARANTINE', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'bundle', gameStatus: null, releaseDate: past }).decision,
    ).toBe(CatalogPolicyDecision.QUARANTINE);
  });

  it('port ignores release evidence (PORT, never canonical)', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'port', gameStatus: null, releaseDate: past }).decision,
    ).toBe(CatalogPolicyDecision.PORT);
  });

  it('unknown game_type with past evidence stays REVIEW_REQUIRED', () => {
    expect(
      evaluateCatalogPolicy({ gameType: 'hyper_game', gameStatus: null, releaseDate: past })
        .decision,
    ).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
  });

  it('accepts Date and ISO string evidence', () => {
    expect(
      evaluateCatalogPolicy({
        gameType: 'main_game',
        gameStatus: null,
        releaseDate: new Date('2010-05-18T00:00:00Z'),
      }).decision,
    ).toBe(CatalogPolicyDecision.CANONICAL);
    expect(
      evaluateCatalogPolicy({
        gameType: 'main_game',
        gameStatus: null,
        releaseDate: '2001-07-23',
      }).decision,
    ).toBe(CatalogPolicyDecision.CANONICAL);
    expect(
      evaluateCatalogPolicy({ gameType: 'main_game', gameStatus: null, releaseDate: 'not-a-date' })
        .decision,
    ).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
  });

  it('year precision requires a fully past year', () => {
    const thisYear = new Date().getUTCFullYear();
    expect(
      evaluateCatalogPolicy({
        gameType: 'main_game',
        gameStatus: null,
        releaseDate: { year: thisYear - 1, month: null, day: null, precision: 'year' as const },
      }).decision,
    ).toBe(CatalogPolicyDecision.CANONICAL);
    expect(
      evaluateCatalogPolicy({
        gameType: 'main_game',
        gameStatus: null,
        releaseDate: { year: thisYear, month: null, day: null, precision: 'year' as const },
      }).decision,
    ).toBe(CatalogPolicyDecision.REVIEW_REQUIRED);
  });
});
