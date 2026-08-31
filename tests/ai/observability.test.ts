import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logAIOperation, startAITimer } from '../../src/ai/observability.js';
import type { AIOperationEvent } from '../../src/ai/observability.js';

describe('AI Observability', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('logs successful classification operation', () => {
    const event: AIOperationEvent = {
      event: 'ai.operation',
      operation: 'classification',
      provider: 'ollama',
      model: 'qwen3:8b',
      promptVersion: 'classification-v1',
      durationMs: 1500,
      success: true,
      fallback: false,
      confidence: 0.91,
      escalationReason: 'low_confidence',
    };

    logAIOperation(event);

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('ai.operation');
    expect(output).toContain('classification');
    expect(output).toContain('qwen3:8b');
    expect(output).toContain('1500');
  });

  it('logs failed operation with fallback', () => {
    const event: AIOperationEvent = {
      event: 'ai.operation',
      operation: 'identity_resolution',
      provider: 'ollama',
      model: 'qwen3:8b',
      promptVersion: 'identity-v1',
      durationMs: 10002,
      success: false,
      fallback: true,
      fallbackReason: 'ai_timeout',
      escalationReason: 'unresolved',
    };

    logAIOperation(event);

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('ai_timeout');
    expect(output).toContain('true');
  });

  it('logs enrichment conflict operation', () => {
    const event: AIOperationEvent = {
      event: 'ai.operation',
      operation: 'enrichment_conflict',
      provider: 'ollama',
      model: 'qwen3:8b',
      promptVersion: 'enrichment-v1',
      durationMs: 800,
      success: true,
      fallback: false,
      confidence: 0.85,
    };

    logAIOperation(event);

    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('enrichment_conflict');
    expect(output).toContain('0.85');
  });

  it('logs escalation reason', () => {
    const event: AIOperationEvent = {
      event: 'ai.operation',
      operation: 'classification',
      provider: 'ollama',
      model: 'qwen3:8b',
      promptVersion: 'classification-v1',
      durationMs: 1200,
      success: true,
      fallback: false,
      confidence: 0.88,
      escalationReason: 'unknown_category',
    };

    logAIOperation(event);

    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('unknown_category');
  });

  it('does not throw if logger fails', () => {
    stdoutSpy.mockImplementation(() => {
      throw new Error('Logger broken');
    });

    expect(() => {
      logAIOperation({
        event: 'ai.operation',
        operation: 'classification',
        provider: 'ollama',
        model: 'qwen3:8b',
        promptVersion: 'classification-v1',
        durationMs: 100,
        success: true,
        fallback: false,
      });
    }).not.toThrow();
  });

  it('startAITimer returns elapsed time', () => {
    const timer = startAITimer();
    const elapsed = timer();
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('startAITimer measures duration', async () => {
    const timer = startAITimer();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const elapsed = timer();
    expect(elapsed).toBeGreaterThanOrEqual(5);
  });

  it('logs prompt version', () => {
    const event: AIOperationEvent = {
      event: 'ai.operation',
      operation: 'classification',
      provider: 'ollama',
      model: 'qwen3:8b',
      promptVersion: 'classification-v2',
      durationMs: 500,
      success: true,
      fallback: false,
    };

    logAIOperation(event);

    const output = stdoutSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('classification-v2');
  });
});
