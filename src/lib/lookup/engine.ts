import type { CatalogSource, GenreHit, Track, TrackResult } from '../music';
import { canonicalGenre } from '../genres';
import { stableTrackId } from '../music';
import { yandexGenreLabel } from '../yandex-genres';
import { groupTracks, type LookupGroup } from './groups';
import { NegativeCache, negativeKey } from './negative-cache';
import type { GenreProvider, ProviderResult } from './types';

export type LookupCallbacks = {
  onProgress?: (done: number, total: number) => void;
  onPartial?: (results: TrackResult[]) => void;
  onSave?: (results: TrackResult[]) => Promise<void>;
  signal?: AbortSignal;
};

export type LookupOptions = {
  providers: GenreProvider[];
  negativeCache: NegativeCache;
  /** Re-query tracks that already have a checked result. */
  force?: boolean;
  saveEveryGroups?: number;
  /** Awaited before each provider request; used by the UI pause button. */
  gate?: () => Promise<void>;
};

type GroupState = {
  group: LookupGroup;
  hits: Map<string, GenreHit[]>;
  errors: Partial<Record<CatalogSource, string>>;
  waiting: number;
  settled: Set<string>;
};

function seedResult(track: Track): TrackResult {
  const label = yandexGenreLabel(track.yandexGenre);
  return {
    track,
    genres: label ? [{ name: label, sources: ['Yandex'] }] : [],
    status: label ? 'matched' : 'unmatched',
    checked: false,
  };
}

function uniqueHits(hits: GenreHit[]): GenreHit[] {
  const seen = new Set<string>();
  const output: GenreHit[] = [];
  for (const hit of hits) {
    const name = canonicalGenre(hit.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    output.push({ name, sources: [...new Set(hit.sources)] });
  }
  return output;
}

function chooseHits(state: GroupState, providers: GenreProvider[]): GenreHit[] {
  for (const provider of providers) {
    const hits = state.hits.get(provider.id);
    if (hits?.length) return uniqueHits(hits);
  }
  return [];
}

function providerError(id: string): CatalogSource {
  if (id === 'musicbrainz') return 'MusicBrainz';
  if (id === 'spotify') return 'Spotify';
  return 'Discogs';
}

/**
 * Refines every track that is not checked yet. Groups are ordered by size, so
 * large albums improve the cloud first. Providers run their own rate-limited
 * queues in parallel; when a group is finished the winning genre set is copied
 * to every track in it.
 */
export async function refineLibrary(
  tracks: Track[],
  existing: TrackResult[],
  { providers, negativeCache, force = false, saveEveryGroups = 5, gate }: LookupOptions,
  callbacks: LookupCallbacks = {},
): Promise<TrackResult[]> {
  const { onProgress, onPartial, onSave, signal } = callbacks;
  const unique = [...new Map(tracks.map((track) => [stableTrackId(track), track])).values()];
  const byId = new Map<string, TrackResult>();
  const previous = new Map(existing.map((result) => [stableTrackId(result.track), result]));

  for (const track of unique) {
    const cached = previous.get(stableTrackId(track));
    if (cached && cached.checked && !force) {
      byId.set(stableTrackId(track), { ...cached, track });
    } else {
      const seed = seedResult(track);
      // A forced refresh keeps the previous genres visible while the group is
      // being re-queried instead of dropping the cloud back to the seed.
      byId.set(
        stableTrackId(track),
        cached && !cached.checked ? seed : { ...seed, genres: cached?.genres ?? seed.genres },
      );
    }
  }

  const pending = unique.filter((track) => {
    const cached = previous.get(stableTrackId(track));
    return !cached || !cached.checked || force;
  });

  const groups = groupTracks(pending);
  const sortedProviders = [...providers].sort((left, right) => left.priority - right.priority);
  const states: GroupState[] = groups.map((group) => ({
    group,
    hits: new Map(),
    errors: {},
    waiting: sortedProviders.length,
    settled: new Set(),
  }));

  let done = 0;
  let sinceSave = 0;
  const snapshot = () => unique.map((track) => byId.get(stableTrackId(track))!).filter(Boolean);
  if (!sortedProviders.length) {
    for (const track of pending) {
      const seed = seedResult(track);
      byId.set(stableTrackId(track), { ...seed, checked: true });
    }
    const results = snapshot();
    onPartial?.(results);
    await onSave?.(results);
    return results;
  }
  onProgress?.(0, groups.length);
  onPartial?.(snapshot());

  const writeGroup = (state: GroupState, final: boolean) => {
    const genres = chooseHits(state, sortedProviders);
    const hasError = Object.keys(state.errors).length > 0;
    for (const track of state.group.tracks) {
      const current = byId.get(stableTrackId(track));
      if (!current) continue;
      if (genres.length) {
        byId.set(stableTrackId(track), {
          track,
          genres,
          status: 'matched',
          checked: true,
        });
      } else if (final) {
        // The Yandex album genre is a legitimate fallback, not a miss.
        const hasSeed = current.genres.length > 0;
        byId.set(stableTrackId(track), {
          track,
          genres: current.genres,
          status: hasSeed ? 'matched' : hasError ? 'error' : 'unmatched',
          errors: !hasSeed && hasError ? state.errors : undefined,
          checked: true,
        });
      }
    }
  };

  const settle = (state: GroupState, provider: GenreProvider, result: ProviderResult) => {
    if (state.settled.has(provider.id)) return;
    state.settled.add(provider.id);
    state.waiting -= 1;
    if (result.error) {
      state.errors[providerError(provider.id)] = result.error;
    }
    if (result.genres.length) {
      state.hits.set(provider.id, result.genres);
    }

    const final = state.waiting <= 0;
    writeGroup(state, final);
    onPartial?.(snapshot());

    if (final) {
      done += 1;
      onProgress?.(done, states.length);
      sinceSave += 1;
      if (onSave && (sinceSave >= saveEveryGroups || done === states.length)) {
        sinceSave = 0;
        void onSave(snapshot());
      }
    }
  };

  await Promise.all(
    sortedProviders.map(async (provider) => {
      for (const state of states) {
        if (signal?.aborted) return;
        const key = negativeKey(provider.id, state.group.key);
        if (negativeCache.has(key)) {
          settle(state, provider, { genres: [] });
          continue;
        }
        await gate?.();
        if (signal?.aborted) return;
        let result: ProviderResult;
        try {
          result = await provider.lookup(state.group, signal);
        } catch (error) {
          result = {
            genres: [],
            error: error instanceof Error ? error.message : 'Request failed',
          };
        }
        if (signal?.aborted) return;
        if (result.genres.length) negativeCache.delete(key);
        else if (!result.error) negativeCache.set(key);
        settle(state, provider, result);
      }
    }),
  );

  if (onProgress) onProgress(done, states.length);
  const finalResults = snapshot();
  onPartial?.(finalResults);
  await onSave?.(finalResults);
  return finalResults;
}
