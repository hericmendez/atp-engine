import { describe, it, expect } from 'vitest';
import { formatEtaPrecise, formatRate, formatTimeAgo, getLeaseHealth, friendlyConflictMessage } from './format';

describe('format helpers', () => {
  it('formatEtaPrecise null → —', () => expect(formatEtaPrecise(null)).toBe('—'));
  it('formatEtaPrecise 42s', () => expect(formatEtaPrecise(42)).toBe('42s'));
  it('formatEtaPrecise 192s → 3m 12s', () => expect(formatEtaPrecise(192)).toBe('3m 12s'));
  it('formatEtaPrecise 5040s → 1h 24m', () => expect(formatEtaPrecise(5040)).toBe('1h 24m'));
  it('formatEtaPrecise 180000s → 2d 2h', () => expect(formatEtaPrecise(180000)).toBe('2d 2h'));

  it('formatRate null → —', () => expect(formatRate(null)).toBe('—'));
  it('formatRate 1.28', () => expect(formatRate(1.28)).toBe('1.28 items/s'));

  it('formatTimeAgo just now', () => {
    const iso = new Date(Date.now() - 2000).toISOString();
    expect(formatTimeAgo(iso)).toBe('just now');
  });
  it('formatTimeAgo 2m ago', () => {
    const iso = new Date(Date.now() - 120_000).toISOString();
    expect(formatTimeAgo(iso)).toBe('2m ago');
  });

  it('getLeaseHealth Healthy >10s', () => expect(getLeaseHealth(15000, 'RUNNING')).toBe('Healthy'));
  it('getLeaseHealth Expiring 5s', () => expect(getLeaseHealth(5000, 'RUNNING')).toBe('Expiring'));
  it('getLeaseHealth Expired 0', () => expect(getLeaseHealth(0, 'RUNNING')).toBe('Expired'));
  it('getLeaseHealth — for PAUSED', () => expect(getLeaseHealth(5000, 'PAUSED')).toBe('—'));

  it('friendlyConflictMessage maps already running', () => {
    expect(friendlyConflictMessage('CONFLICT', 'Job already running (owner runner:1)', 409)).toContain('already running');
  });
  it('friendlyConflictMessage maps completed', () => {
    expect(friendlyConflictMessage('CONFLICT', 'Cannot pause job in status COMPLETED', 409)).toContain('already completed');
  });
  it('friendlyConflictMessage non-409 passthrough', () => {
    expect(friendlyConflictMessage('NOT_FOUND', 'not found', 404)).toBe('not found');
  });
});
