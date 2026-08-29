import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig, getConfig, resetConfig } from '../src/infrastructure/config/config.js';

describe('config', () => {
  beforeEach(() => {
    resetConfig();
  });

  it('loads default configuration successfully', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.MONGODB_URI).toBe('mongodb://localhost:27017/atp-engine');
    expect(config.AI_ENABLED).toBe(false);
  });

  it('parses custom environment values', () => {
    const config = loadConfig({
      PORT: '4000',
      NODE_ENV: 'production',
      AI_ENABLED: 'true',
    });
    expect(config.PORT).toBe(4000);
    expect(config.NODE_ENV).toBe('production');
    expect(config.AI_ENABLED).toBe(true);
  });

  it('throws on invalid PORT', () => {
    expect(() => loadConfig({ PORT: 'not-a-number' })).toThrow('Invalid environment configuration');
  });

  it('throws on invalid NODE_ENV', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow('Invalid environment configuration');
  });

  it('throws on invalid MONGODB_URI', () => {
    expect(() => loadConfig({ MONGODB_URI: 'not-a-url' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('getConfig throws when not loaded', () => {
    expect(() => getConfig()).toThrow('Configuration not loaded');
  });

  it('getConfig returns loaded config', () => {
    loadConfig({});
    const config = getConfig();
    expect(config.PORT).toBe(3000);
  });
});
