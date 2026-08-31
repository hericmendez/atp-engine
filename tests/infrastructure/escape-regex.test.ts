import { describe, it, expect } from 'vitest';
import { escapeRegex } from '../../src/infrastructure/persistence/mongodb/escape-regex.js';

describe('escapeRegex', () => {
  it('passes through normal text unchanged', () => {
    expect(escapeRegex('zelda')).toBe('zelda');
    expect(escapeRegex('Final Fantasy')).toBe('Final Fantasy');
    expect(escapeRegex('Resident Evil 4')).toBe('Resident Evil 4');
  });

  it('escapes dot', () => {
    expect(escapeRegex('a.b')).toBe('a\\.b');
  });

  it('escapes asterisk', () => {
    expect(escapeRegex('a*b')).toBe('a\\*b');
  });

  it('escapes plus', () => {
    expect(escapeRegex('a+b')).toBe('a\\+b');
  });

  it('escapes question mark', () => {
    expect(escapeRegex('a?b')).toBe('a\\?b');
  });

  it('escapes parentheses', () => {
    expect(escapeRegex('a(b)c')).toBe('a\\(b\\)c');
  });

  it('escapes square brackets', () => {
    expect(escapeRegex('a[b]c')).toBe('a\\[b\\]c');
  });

  it('escapes curly braces', () => {
    expect(escapeRegex('a{b}c')).toBe('a\\{b\\}c');
  });

  it('escapes caret', () => {
    expect(escapeRegex('^start')).toBe('\\^start');
  });

  it('escapes dollar sign', () => {
    expect(escapeRegex('end$')).toBe('end\\$');
  });

  it('escapes pipe', () => {
    expect(escapeRegex('a|b')).toBe('a\\|b');
  });

  it('escapes backslash', () => {
    expect(escapeRegex('a\\b')).toBe('a\\\\b');
  });

  it('handles the ReDoS payload (a+)+$', () => {
    expect(escapeRegex('(a+)+$')).toBe('\\(a\\+\\)\\+\\$');
  });

  it('escapes all special characters together', () => {
    const input = '.*+?^${}()|[]\\';
    const expected = '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\';
    expect(escapeRegex(input)).toBe(expected);
  });
});
