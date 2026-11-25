/**
 * Deterministic virtual clock for benchmarks. Timers resolve only when the
 * driver advances time, so a 35-minute simulated run finishes in milliseconds
 * without weakening the rate-limit math.
 */
export class VirtualClock {
  time = 0;
  private waiters: Array<{ at: number; resolve: () => void }> = [];

  now = (): number => this.time;

  sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      this.waiters.push({ at: this.time + Math.max(0, ms), resolve });
    });

  private async flush(): Promise<void> {
    for (let index = 0; index < 3; index += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  async run<T>(work: Promise<T>): Promise<T> {
    let settled = false;
    work.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    while (!settled) {
      await this.flush();
      if (settled) break;
      if (this.waiters.length) {
        const next = Math.min(...this.waiters.map((waiter) => waiter.at));
        this.time = Math.max(this.time, next);
        const ready = this.waiters.filter((waiter) => waiter.at <= this.time);
        this.waiters = this.waiters.filter((waiter) => waiter.at > this.time);
        for (const waiter of ready) waiter.resolve();
      } else {
        // Give promise chains that are about to schedule a timer a chance to
        // run instead of spinning at the same timestamp forever.
        this.time += 1;
      }
    }
    return work;
  }
}
