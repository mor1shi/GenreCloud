import { describe, expect, it, vi } from 'vitest';
import { canonicalGenre, isMusicBrainzGenre } from '../src/lib/genres';
import type { Track, TrackResult } from '../src/lib/music';
import { refineLibrary } from '../src/lib/lookup/engine';
import { groupTracks } from '../src/lib/lookup/groups';
import { NegativeCache, NEGATIVE_TTL_MS } from '../src/lib/lookup/negative-cache';
import { RateLimiter } from '../src/lib/lookup/rate-limiter';
import { fetchJson } from '../src/lib/lookup/http';
import { createDiscogsProvider } from '../src/lib/providers/discogs';
import { createMusicBrainzProvider } from '../src/lib/providers/musicbrainz';
import type { GenreProvider } from '../src/lib/lookup/types';

const track = (id: string, artist: string, album: string | undefined, title = 'Song'): Track => ({
  id,
  artist,
  album,
  title,
});

describe('grouping', () => {
  it('groups by artist and album, keeps singles per artist', () => {
    const groups = groupTracks([
      track('1', 'A', 'One'),
      track('2', 'A', 'One'),
      track('3', 'A', 'Two'),
      track('4', 'B', undefined, 'Single'),
      track('5', 'B', undefined, 'Another'),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].tracks).toHaveLength(2);
    expect(groups.map((group) => group.key)).toContain('artist:b');
  });
});

describe('genre normalization', () => {
  it('merges spelling variants', () => {
    expect(canonicalGenre('hip-hop')).toBe('Hip Hop');
    expect(canonicalGenre('hip hop')).toBe('Hip Hop');
    expect(canonicalGenre('synth-pop')).toBe('Synthpop');
    expect(canonicalGenre('R&B')).toBe('R&B');
  });

  it('accepts only known MusicBrainz genres', () => {
    expect(isMusicBrainzGenre('shoegaze')).toBe(true);
    expect(isMusicBrainzGenre('british')).toBe(false);
  });
});

describe('rate limiter', () => {
  it('spaces requests and respects penalties', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter({
      intervalMs: 2000,
      clock: {
        now: () => now,
        sleep: async (ms) => {
          sleeps.push(ms);
          now += ms;
        },
      },
    });
    await limiter.acquire();
    await limiter.acquire();
    expect(sleeps).toEqual([2000]);
    limiter.penalize(6000);
    await limiter.acquire();
    expect(now).toBeGreaterThanOrEqual(8000);
  });
});

describe('fetchJson', () => {
  it('retries 429 with Retry-After', async () => {
    let now = 0;
    const limiter = new RateLimiter({
      intervalMs: 10,
      clock: { now: () => now, sleep: async (ms) => void (now += ms) },
    });
    const calls: number[] = [];
    const fetchImpl = vi.fn(async () => {
      calls.push(now);
      if (calls.length === 1) {
        return new Response('{}', { status: 429, headers: { 'Retry-After': '3' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const data = await fetchJson<{ ok: boolean }>('https://example.test', {
      limiter,
      fetchImpl,
    });
    expect(data.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(3000);
  });
});

describe('negative cache', () => {
  it('expires misses after the TTL', () => {
    let now = 1000;
    const cache = new NegativeCache(null, () => now);
    cache.set('discogs:album:a::b');
    expect(cache.has('discogs:album:a::b')).toBe(true);
    now += NEGATIVE_TTL_MS + 1;
    expect(cache.has('discogs:album:a::b')).toBe(false);
  });
});

describe('providers', () => {
  it('reads Discogs styles and canonicalizes them', async () => {
    const provider = createDiscogsProvider({
      limiter: new RateLimiter({ intervalMs: 1 }),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            results: [{ title: 'Album', style: ['Shoegaze', 'Dream Pop'], genre: ['Rock'] }],
          }),
          { status: 200 },
        ),
    });
    const result = await provider.lookup(groupTracks([track('1', 'A', 'Album')])[0]);
    expect(result.genres.map((hit) => hit.name)).toEqual(['Shoegaze', 'Dream Pop', 'Rock']);
    expect(result.genres[0].sources).toEqual(['Discogs']);
  });

  it('uses MusicBrainz tags from the search response and drops non-genres', async () => {
    const provider = createMusicBrainzProvider({
      limiter: new RateLimiter({ intervalMs: 1 }),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            'release-groups': [
              {
                title: 'Album',
                'artist-credit': [{ name: 'A' }],
                tags: [
                  { name: 'british', count: 9 },
                  { name: 'shoegaze', count: 4 },
                  { name: 'dream pop', count: 2 },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
    });
    const result = await provider.lookup(groupTracks([track('1', 'A', 'Album')])[0]);
    expect(result.genres.map((hit) => hit.name)).toEqual(['Shoegaze', 'Dream Pop']);
  });
});

describe('lookup engine', () => {
  it('queries each group once and shares the result', async () => {
    const lookup = vi.fn(async (group: { key: string }) => ({
      genres: group.key.startsWith('album:a::one')
        ? [{ name: 'Rock', sources: ['Discogs' as const] }]
        : [{ name: 'Pop', sources: ['MusicBrainz' as const] }],
    }));
    const provider: GenreProvider = {
      id: 'discogs',
      label: 'Test',
      priority: 10,
      lookup,
    };
    const tracks = [
      track('1', 'A', 'One'),
      track('2', 'A', 'One'),
      track('3', 'A', 'Two'),
    ];
    const results = await refineLibrary(tracks, [], {
      providers: [provider],
      negativeCache: new NegativeCache(),
    });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(3);
    expect(results[0].genres[0].name).toBe('Rock');
    expect(results[2].genres[0].name).toBe('Pop');
  });

  it('prefers the higher-priority provider and keeps seeds as fallback', async () => {
    const discogs: GenreProvider = {
      id: 'discogs',
      label: 'Discogs',
      priority: 10,
      lookup: async () => ({ genres: [{ name: 'Shoegaze', sources: ['Discogs'] }] }),
    };
    const musicbrainz: GenreProvider = {
      id: 'musicbrainz',
      label: 'MusicBrainz',
      priority: 20,
      lookup: async () => ({ genres: [{ name: 'Dream Pop', sources: ['MusicBrainz'] }] }),
    };
    const tracks = [{ ...track('1', 'A', 'One'), yandexGenre: 'rock' }];
    const results = await refineLibrary(tracks, [], {
      providers: [musicbrainz, discogs],
      negativeCache: new NegativeCache(),
    });
    expect(results[0].genres.map((hit) => hit.name)).toEqual(['Shoegaze']);

    const seeded = await refineLibrary(
      [{ ...track('2', 'B', 'Lost'), yandexGenre: 'pop' }],
      [],
      {
        providers: [
          { ...discogs, lookup: async () => ({ genres: [] }) },
          { ...musicbrainz, lookup: async () => ({ genres: [] }) },
        ],
        negativeCache: new NegativeCache(),
      },
    );
    expect(seeded[0].genres[0].name).toBe('Pop');
    expect(seeded[0].status).toBe('matched');
  });

  it('skips negative-cached groups on refresh and returns cached results', async () => {
    const lookup = vi.fn(async () => ({ genres: [] }));
    const provider: GenreProvider = {
      id: 'discogs',
      label: 'Discogs',
      priority: 10,
      lookup,
    };
    const cache = new NegativeCache();
    const tracks: Track[] = [track('1', 'A', 'One')];
    const first = await refineLibrary(tracks, [], {
      providers: [provider],
      negativeCache: cache,
    });
    expect(lookup).toHaveBeenCalledTimes(1);

    const existing: TrackResult[] = first;
    const second = await refineLibrary(tracks, existing, {
      providers: [provider],
      negativeCache: cache,
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(second[0].checked).toBe(true);

    await refineLibrary(tracks, existing, {
      providers: [provider],
      negativeCache: cache,
      force: true,
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('reports errors only when no source produced genres', async () => {
    const failing: GenreProvider = {
      id: 'discogs',
      label: 'Discogs',
      priority: 10,
      lookup: async () => ({ genres: [], error: 'HTTP 429' }),
    };
    const results = await refineLibrary([track('1', 'A', 'One')], [], {
      providers: [failing],
      negativeCache: new NegativeCache(),
    });
    expect(results[0].status).toBe('error');
    expect(results[0].errors?.Discogs).toBe('HTTP 429');
  });
});
