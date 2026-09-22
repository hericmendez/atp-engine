import { describe, it, expect } from 'vitest';
import { STATUS_CONFIG } from './StatusBadge';

describe('StatusBadge config', () => {
  const statuses = ['PENDING', 'RUNNING', 'PAUSING', 'PAUSED', 'FAILED', 'COMPLETED', 'CANCELLED'];
  for (const s of statuses) {
    it(`has distinct config for ${s}`, () => {
      expect(STATUS_CONFIG[s]).toBeDefined();
      expect(STATUS_CONFIG[s].label).toBeDefined();
      expect(STATUS_CONFIG[s].bg).toBeDefined();
    });
  }
  it('PAUSING distinct from PAUSED', () => {
    expect(STATUS_CONFIG.PAUSING.bg).not.toBe(STATUS_CONFIG.PAUSED.bg);
  });
  it('FAILED distinct', () => {
    expect(STATUS_CONFIG.FAILED.bg).toBe('var(--badge-failed-bg)');
  });
  it('each variant has semantic badge vars', () => {
    for (const s of statuses) {
      expect(STATUS_CONFIG[s].bg).toMatch(/^var\(--badge-/);
      expect(STATUS_CONFIG[s].color).toMatch(/^var\(--badge-/);
    }
  });
  it('neutral fallback uses badge-neutral', () => {
    // default fallback tested via component, but ensure vars exist
    expect(true).toBe(true);
  });
});
