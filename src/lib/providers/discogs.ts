import { canonicalGenre } from '../genres';
import type { GenreHit } from '../music';
import { HttpError, fetchJson } from '../lookup/http';
import type { RateLimiter } from '../lookup/rate-limiter';
import { cleanSearchTitle, primaryArtist, similarity } from '../lookup/search';
import type { LookupGroup } from '../lookup/groups';
import type { GenreProvider, ProviderResult } from '../lookup/types';

type DiscogsRelease = {
  title?: string;
  genre?: string[];
  style?: string[];
  resource_url?: string;
  year?: string;
};

type DiscogsSearch = {
  results?: DiscogsRelease[];
};

function describe(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) return 'Discogs token rejected';
    if (error.status === 429) return 'Discogs rate limit reached';
    if (error.status === 0) return 'Discogs network error';
    return `Discogs HTTP ${error.status}`;
  }
  return error instanceof Error ? error.message : 'Discogs request failed';
}

function toHits(release: DiscogsRelease | undefined): GenreHit[] {
  if (!release) return [];
  const seen = new Set<string>();
  const hits: GenreHit[] = [];
  for (const raw of [...(release.style ?? []), ...(release.genre ?? [])]) {
    const name = canonicalGenre(raw);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    hits.push({ name, sources: ['Discogs'] });
  }
  return hits;
}

export type DiscogsOptions = {
  limiter: RateLimiter;
  token?: string;
  fetchImpl?: typeof fetch;
};

export function createDiscogsProvider({
  limiter,
  token,
  fetchImpl,
}: DiscogsOptions): GenreProvider {
  return {
    id: 'discogs',
    label: 'Discogs',
    priority: 10,
    async lookup(group: LookupGroup, signal?: AbortSignal): Promise<ProviderResult> {
      try {
        const params = new URLSearchParams({ type: 'release', per_page: '5' });
        if (group.kind === 'album' && group.album) {
          params.set('artist', primaryArtist(group.artist));
          params.set('release_title', group.album);
        } else if (group.tracks.length === 1) {
          params.set('artist', primaryArtist(group.artist));
          params.set('track', cleanSearchTitle(group.tracks[0].title));
        } else {
          params.set('artist', primaryArtist(group.artist));
        }

        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Discogs token=${token}`;

        const search = await fetchJson<DiscogsSearch>(
          `https://api.discogs.com/database/search?${params.toString()}`,
          {
            limiter,
            headers,
            fetchImpl,
            onResponseHeaders: (responseHeaders) => {
              const remaining = Number(responseHeaders.get('x-discogs-ratelimit-remaining'));
              const total = Number(responseHeaders.get('x-discogs-ratelimit'));
              limiter.noteDiscogsHeaders(
                Number.isFinite(remaining) ? remaining : null,
                Number.isFinite(total) ? total : null,
              );
            },
          },
        );
        if (signal?.aborted) return { genres: [] };

        const results = search.results ?? [];
        if (!results.length) return { genres: [] };

        const target = group.album ?? group.tracks[0]?.title ?? '';
        const ranked = results
          .map((release) => ({
            release,
            score: similarity(target, `${release.title ?? ''}`),
          }))
          .sort((left, right) => right.score - left.score);
        const best = ranked[0]?.release;
        let hits = toHits(best);

        // Search results occasionally omit styles. One details request is
        // cheaper than losing the only genre source for the group.
        if (!hits.length && best?.resource_url) {
          const details = await fetchJson<DiscogsRelease>(best.resource_url, {
            limiter,
            headers,
            fetchImpl,
          });
          hits = toHits(details);
        }

        return { genres: hits };
      } catch (error) {
        return { genres: [], error: describe(error) };
      }
    },
  };
}
