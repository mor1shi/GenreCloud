import { describe, expect, it } from 'vitest';
import { VirtualClock } from './clock';
import { buildLibraryFixture, discogsStyles, musicBrainzTags } from './fixtures';
import { refineLibrary } from '../src/lib/lookup/engine';
import { NegativeCache } from '../src/lib/lookup/negative-cache';
import { RateLimiter } from '../src/lib/lookup/rate-limiter';
import { createDiscogsProvider } from '../src/lib/providers/discogs';
import { createMusicBrainzProvider } from '../src/lib/providers/musicbrainz';
import type { Track } from '../src/lib/music';

const LATENCY_MS = 150;

function json(data: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function quoted(query: string, field: string): string {
  const match = query.match(new RegExp(`${field}:"([^"]*)"`));
  return match?.[1] ?? '';
}

async function baseline(tracks: Track[], clock: VirtualClock) {
  let discogsRequests = 0;
  let musicBrainzRequests = 0;
  for (const track of tracks) {
    await clock.sleep(2700);
    discogsRequests += 1;
    const styles = discogsStyles(track.artist, track.album, track.album ? undefined : track.title);
    if (!styles.length) {
      await clock.sleep(1500);
      musicBrainzRequests += 1;
    }
  }
  return { elapsedMs: clock.now(), discogsRequests, musicBrainzRequests };
}

describe('genre lookup benchmark', () => {
  it('is at least three times faster than the per-track baseline', { timeout: 30_000 }, async () => {
    const fixture = buildLibraryFixture();
    const baselineClock = new VirtualClock();
    const before = await baselineClock.run(baseline(fixture.tracks, baselineClock));

    const clock = new VirtualClock();
    let discogsRequests = 0;
    let musicBrainzRequests = 0;

    const discogsFetch: typeof fetch = async (input) => {
      await clock.sleep(LATENCY_MS);
      discogsRequests += 1;
      const url = new URL(String(input));
      const artist = url.searchParams.get('artist') ?? '';
      const album = url.searchParams.get('release_title') ?? undefined;
      const title = url.searchParams.get('track') ?? undefined;
      const styles = discogsStyles(artist, album, title);
      return json(
        {
          results: styles.length
            ? [{ title: album ?? title ?? artist, style: styles, genre: ['Rock'] }]
            : [],
        },
        { 'x-discogs-ratelimit': '25', 'x-discogs-ratelimit-remaining': '18' },
      );
    };

    const musicBrainzFetch: typeof fetch = async (input) => {
      await clock.sleep(80);
      musicBrainzRequests += 1;
      const url = new URL(String(input));
      const query = url.searchParams.get('query') ?? '';
      if (url.pathname.includes('release-group')) {
        const album = quoted(query, 'releasegroup');
        const artist = quoted(query, 'artist');
        const tags = musicBrainzTags(artist, album);
        return json({
          'release-groups': [
            {
              title: album,
              'artist-credit': [{ name: artist }],
              tags: tags.map((name, index) => ({ name, count: 5 - index })),
            },
          ],
        });
      }
      const artist = quoted(query, 'artist');
      const tags = musicBrainzTags(artist);
      return json({
        artists: [{ name: artist, tags: tags.map((name, index) => ({ name, count: 5 - index })) }],
      });
    };

    const providers = [
      createDiscogsProvider({
        limiter: new RateLimiter({ intervalMs: 2400, clock }),
        fetchImpl: discogsFetch,
      }),
      createMusicBrainzProvider({
        limiter: new RateLimiter({ intervalMs: 1100, clock }),
        fetchImpl: musicBrainzFetch,
      }),
    ];

    const work = refineLibrary(
      fixture.tracks,
      [],
      { providers, negativeCache: new NegativeCache(null, clock.now), saveEveryGroups: 10_000 },
      {},
    );
    const results = await clock.run(work);
    const after = {
      elapsedMs: clock.now(),
      discogsRequests,
      musicBrainzRequests,
    };

    const speedup = before.elapsedMs / after.elapsedMs;
    const report = {
      tracks: fixture.tracks.length,
      albumGroups: fixture.albumGroups,
      artistGroups: fixture.artistGroups,
      baseline: { ...before, minutes: +(before.elapsedMs / 60_000).toFixed(1) },
      grouped: { ...after, minutes: +(after.elapsedMs / 60_000).toFixed(1) },
      speedup: +speedup.toFixed(2),
      requestReduction: +(1 - (after.discogsRequests + after.musicBrainzRequests) / (before.discogsRequests + before.musicBrainzRequests)).toFixed(3),
    };
    console.log('BENCHMARK', JSON.stringify(report));

    expect(results).toHaveLength(fixture.tracks.length);
    expect(after.discogsRequests).toBeLessThan(before.discogsRequests / 3);
    expect(speedup).toBeGreaterThanOrEqual(3);
  });
});
