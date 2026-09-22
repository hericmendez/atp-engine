import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const scriptsDir = join(import.meta.dirname, '../../src/scripts');

function readScript(name: string): string {
  return readFileSync(join(scriptsDir, name), 'utf8');
}

describe('Enrich CLI bootstrap — loadConfig before infrastructure', () => {
  it('enrich-start calls loadConfig before connectAndLog and createCoverRunner', () => {
    const content = readScript('enrich-start.ts');
    const loadIdx = content.indexOf('loadConfig()');
    const connectIdx = content.indexOf('connectAndLog()');
    const runnerIdx = content.indexOf('createCoverRunner(');
    expect(loadIdx).toBeGreaterThan(-1);
    expect(connectIdx).toBeGreaterThan(-1);
    expect(runnerIdx).toBeGreaterThan(-1);
    expect(loadIdx).toBeLessThan(connectIdx);
    expect(connectIdx).toBeLessThan(runnerIdx);
  });

  it('enrich-status calls loadConfig before connectAndLog', () => {
    const content = readScript('enrich-status.ts');
    const loadIdx = content.indexOf('loadConfig()');
    const connectIdx = content.indexOf('connectAndLog()');
    expect(loadIdx).toBeGreaterThan(-1);
    expect(connectIdx).toBeGreaterThan(-1);
    expect(loadIdx).toBeLessThan(connectIdx);
  });

  it('enrich-pause calls loadConfig before connectAndLog', () => {
    const content = readScript('enrich-pause.ts');
    const loadIdx = content.indexOf('loadConfig()');
    const connectIdx = content.indexOf('connectAndLog()');
    expect(loadIdx).toBeGreaterThan(-1);
    expect(loadIdx).toBeLessThan(connectIdx);
  });

  it('enrich-resume calls loadConfig before connectAndLog and createCoverRunner', () => {
    const content = readScript('enrich-resume.ts');
    const loadIdx = content.indexOf('loadConfig()');
    const connectIdx = content.indexOf('connectAndLog()');
    const runnerIdx = content.indexOf('createCoverRunner(');
    expect(loadIdx).toBeGreaterThan(-1);
    expect(connectIdx).toBeGreaterThan(-1);
    expect(runnerIdx).toBeGreaterThan(-1);
    expect(loadIdx).toBeLessThan(connectIdx);
    // runner call is after connect, so load before connect suffices
    expect(connectIdx).toBeLessThan(runnerIdx);
  });

  it('enrich-common createCoverRunner does not execute getConfig at import time', () => {
    const content = readScript('enrich-common.ts');
    // Should not have top-level getConfig() call, only inside function
    const lines = content.split('\n');
    const importSectionEnd = lines.findIndex((l) => l.startsWith('export '));
    const topLevel = lines.slice(0, importSectionEnd).join('\n');
    expect(topLevel).not.toMatch(/\bgetConfig\s*\(/);
    expect(topLevel).not.toMatch(/\bloadConfig\s*\(\)/);
  });

  it('no script imports execute repository creation at module scope', () => {
    for (const name of ['enrich-start.ts', 'enrich-status.ts', 'enrich-pause.ts', 'enrich-resume.ts']) {
      const content = readScript(name);
      const beforeMain = content.split('async function main')[0];
      expect(beforeMain).not.toMatch(/new MongoEnrichmentJobRepository/);
      expect(beforeMain).not.toMatch(/new MongoGameRepository/);
      expect(beforeMain).not.toMatch(/new CoverEnrichmentRunner/);
    }
  });
});
