import { describe, it, expect } from 'vitest';
import { logger, setLogLevel } from '../src/infrastructure/logger/logger.js';

describe('logger', () => {
  it('has all log methods', () => {
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('can change log level', () => {
    expect(() => setLogLevel('debug')).not.toThrow();
    expect(() => setLogLevel('info')).not.toThrow();
    expect(() => setLogLevel('warn')).not.toThrow();
    expect(() => setLogLevel('error')).not.toThrow();
  });

  it('does not throw when logging', () => {
    setLogLevel('error');
    expect(() => logger.debug('test debug')).not.toThrow();
    expect(() => logger.info('test info')).not.toThrow();
    expect(() => logger.warn('test warn')).not.toThrow();
    expect(() => logger.error('test error')).not.toThrow();
  });
});
