import type { SourceAdapter } from './source-adapter.js';

export class SourceRegistry {
  private readonly adapters = new Map<string, SourceAdapter>();

  register(adapter: SourceAdapter): void {
    if (this.adapters.has(adapter.source)) {
      throw new Error(`Source adapter already registered: ${adapter.source}`);
    }
    this.adapters.set(adapter.source, adapter);
  }

  unregister(source: string): boolean {
    return this.adapters.delete(source);
  }

  get(source: string): SourceAdapter | undefined {
    return this.adapters.get(source);
  }

  has(source: string): boolean {
    return this.adapters.has(source);
  }

  getAll(): readonly SourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  getSources(): readonly string[] {
    return Array.from(this.adapters.keys());
  }
}
