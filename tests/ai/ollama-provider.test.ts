import { describe, it, expect } from 'vitest';
import { OllamaProvider } from '../../src/ai/ollama-provider.js';

describe('OllamaProvider', () => {
  const provider = new OllamaProvider({
    url: 'http://localhost:11434',
    model: 'qwen3:8b',
    timeoutMs: 10000,
  });

  it('has correct name', () => {
    expect(provider.name).toBe('ollama');
  });

  it('healthCheck returns false when server unreachable', async () => {
    const unreachable = new OllamaProvider({
      url: 'http://localhost:19999',
      model: 'qwen3:8b',
      timeoutMs: 2000,
    });
    const result = await unreachable.healthCheck();
    expect(result).toBe(false);
  });
});
