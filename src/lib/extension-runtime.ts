import type { Track, TrackResult } from './music';
import { refineLibrary } from './lookup/engine';
import { NegativeCache, type NegativeState } from './lookup/negative-cache';
import { RateLimiter } from './lookup/rate-limiter';
import { createDiscogsProvider } from './providers/discogs';
import { createMusicBrainzProvider } from './providers/musicbrainz';
import type { Settings } from './settings';
import { createSource, type SourceId } from './sources/registry';
import { loadLibrary, readLocal, saveLibrary, writeLocal } from './storage';

export async function collectFromSource(
  id: SourceId,
  settings: Settings,
  onProgress?: (count: number) => void,
): Promise<Track[]> {
  const source = await createSource(id, settings);
  return source.collectFavorites(onProgress);
}

const NEGATIVE_KEY = 'genrecloud-negative-cache-v1';

let activeController: AbortController | null = null;
let paused = false;
const gateWaiters: Array<() => void> = [];

export function pauseLookup(): void {
  paused = true;
}

export function resumeLookup(): void {
  paused = false;
  for (const resolve of gateWaiters.splice(0)) resolve();
}

export function cancelLookup(): void {
  resumeLookup();
  activeController?.abort();
}

async function waitWhilePaused(): Promise<void> {
  while (paused) {
    await new Promise<void>((resolve) => gateWaiters.push(resolve));
  }
}

export type LookupCallbacks = {
  onProgress?: (done: number, total: number) => void;
  onPartial?: (results: TrackResult[]) => void;
  onNotice?: (message: string) => void;
};

/**
 * Re-rendering the cloud on every provider response would make the page janky
 * while two queues are reporting in parallel, so partial updates are capped at
 * one per second (leading edge fires immediately).
 */
function throttlePartial(callback?: (results: TrackResult[]) => void) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: TrackResult[] | null = null;
  const flush = () => {
    timer = null;
    if (!pending || !callback) return;
    last = Date.now();
    const value = pending;
    pending = null;
    callback(value);
  };
  const emit = (results: TrackResult[]) => {
    if (!callback) return;
    const now = Date.now();
    if (now - last >= 1000) {
      last = now;
      callback(results);
      return;
    }
    pending = results;
    if (!timer) timer = setTimeout(flush, 1000 - (now - last));
  };
  emit.stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return emit;
}

export async function lookupLibraryGenres(
  tracks: Track[],
  settings: Settings,
  { onProgress, onPartial, onNotice }: LookupCallbacks = {},
  { force = false }: { force?: boolean } = {},
): Promise<TrackResult[]> {
  const library = await loadLibrary().catch(() => ({ results: [] }) as { results: TrackResult[] });
  const storedCache = await readLocal<NegativeState>(NEGATIVE_KEY).catch(() => undefined);
  const negativeCache = new NegativeCache(storedCache);
  negativeCache.prune();

  const controller = new AbortController();
  activeController = controller;

  // A personal Discogs token raises the limit to 60 requests per minute.
  // Without one, 25/min is the documented ceiling; 2.4 s keeps a margin.
  const providers = [
    createDiscogsProvider({
      limiter: new RateLimiter({ intervalMs: settings.discogsToken ? 1050 : 2400 }),
      token: settings.discogsToken || undefined,
    }),
    createMusicBrainzProvider({
      limiter: new RateLimiter({ intervalMs: 1100 }),
    }),
  ];

  const emitPartial = throttlePartial(onPartial);

  try {
    let existing = library.results;
    if (settings.enableSpotify && tracks.some((track) => track.source === 'spotify')) {
      try {
        const { prefillSpotifyGenres } = await import('./sources/spotify/prefill');
        existing = await prefillSpotifyGenres(tracks, existing, settings, {
          onPartial: emitPartial,
        });
        await saveLibrary(existing);
      } catch (error) {
        onNotice?.(
          error instanceof Error
            ? `Spotify genres are unavailable: ${error.message}`
            : 'Spotify genres are unavailable.',
        );
      }
    }

    return await refineLibrary(
      tracks,
      existing,
      { providers, negativeCache, force, saveEveryGroups: 5, gate: waitWhilePaused },
      {
        onProgress,
        onPartial: emitPartial,
        onSave: saveLibrary,
        signal: controller.signal,
      },
    );
  } finally {
    paused = false;
    emitPartial.stop();
    negativeCache.prune();
    await writeLocal(NEGATIVE_KEY, negativeCache.toState()).catch(() => undefined);
    activeController = null;
  }
}
