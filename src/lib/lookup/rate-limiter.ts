export type Clock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type RateLimiterOptions = {
  /** Minimum spacing between request starts. */
  intervalMs: number;
  clock?: Clock;
};

/**
 * Slot-based limiter. Each acquire() reserves the next slot immediately, so
 * concurrent callers cannot stampede the service while one of them waits.
 * A penalty (429/503) pushes every future slot back.
 */
export class RateLimiter {
  private nextAt = 0;
  private cooldownUntil = 0;
  private interval: number;
  private clock: Clock;

  constructor({ intervalMs, clock = systemClock }: RateLimiterOptions) {
    this.interval = intervalMs;
    this.clock = clock;
  }

  get intervalMs(): number {
    return this.interval;
  }

  setIntervalMs(intervalMs: number): void {
    this.interval = Math.max(1, intervalMs);
  }

  async acquire(): Promise<number> {
    const now = this.clock.now();
    const at = Math.max(now, this.nextAt, this.cooldownUntil);
    this.nextAt = at + this.interval;
    const wait = at - now;
    if (wait > 0) await this.clock.sleep(wait);
    return wait;
  }

  penalize(ms: number): void {
    this.cooldownUntil = Math.max(this.cooldownUntil, this.clock.now() + Math.max(0, ms));
  }

  /** Reads Discogs rate-limit headers after a response. */
  noteDiscogsHeaders(remaining: number | null, total: number | null): void {
    if (total && total > 0) {
      this.setIntervalMs(Math.ceil(60_000 / total) + 100);
    }
    if (remaining !== null && remaining <= 0) {
      this.penalize(60_000);
    }
  }
}
