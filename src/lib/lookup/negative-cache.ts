import type { ProviderId } from './types';

export const NEGATIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;

export type NegativeState = {
  schemaVersion: 1;
  entries: Record<string, number>;
};

export function negativeKey(provider: ProviderId, groupKey: string): string {
  return `${provider}:${groupKey}`;
}

/**
 * Remembers "provider returned nothing for this group" so a refresh does not
 * repeat a hopeless request. Only local state; nothing is uploaded.
 */
export class NegativeCache {
  private entries: Map<string, number>;
  private now: () => number;
  private ttlMs: number;

  constructor(state?: NegativeState | null, now: () => number = Date.now, ttlMs = NEGATIVE_TTL_MS) {
    this.now = now;
    this.ttlMs = ttlMs;
    this.entries = new Map(Object.entries(state?.entries ?? {}));
  }

  has(key: string): boolean {
    const at = this.entries.get(key);
    if (at === undefined) return false;
    if (this.now() - at > this.ttlMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  set(key: string): void {
    this.entries.delete(key);
    this.entries.set(key, this.now());
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  prune(): void {
    for (const [key, at] of this.entries) {
      if (this.now() - at > this.ttlMs) this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  toState(): NegativeState {
    return { schemaVersion: 1, entries: Object.fromEntries(this.entries) };
  }
}
