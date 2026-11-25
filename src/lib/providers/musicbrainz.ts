import { canonicalGenre, isMusicBrainzGenre } from '../genres';
import type { GenreHit } from '../music';
import { HttpError, fetchJson } from '../lookup/http';
import type { RateLimiter } from '../lookup/rate-limiter';
import { cleanSearchTitle, primaryArtist, similarity } from '../lookup/search';
import type { LookupGroup } from '../lookup/groups';
import type { GenreProvider, ProviderResult } from '../lookup/types';

type MusicBrainzTag = {
  count?: number;
  name?: string;
};

type MusicBrainzEntity = {
  id?: string;
  title?: string;
  name?: string;
  tags?: MusicBrainzTag[];
  'artist-credit'?: Array<{ name?: string; artist?: { name?: string } }>;
};

type SearchResponse = {
  'release-groups'?: MusicBrainzEntity[];
  recordings?: MusicBrainzEntity[];
  artists?: MusicBrainzEntity[];
};

function describe(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 429) return 'MusicBrainz rate limit reached';
    if (error.status === 503) return 'MusicBrainz is temporarily unavailable';
    if (error.status === 0) return 'MusicBrainz network error';
    return `MusicBrainz HTTP ${error.status}`;
  }
  return error instanceof Error ? error.message : 'MusicBrainz request failed';
}

function artistCredit(entity: MusicBrainzEntity): string {
  return (entity['artist-credit'] ?? [])
    .map((credit) => credit.name ?? credit.artist?.name ?? '')
    .filter(Boolean)
    .join(' ');
}

function tagsToHits(tags: MusicBrainzTag[] | undefined): GenreHit[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  return tags
    .filter((tag) => (tag.count ?? 0) > 0 && tag.name && isMusicBrainzGenre(tag.name))
    .sort((left, right) => (right.count ?? 0) - (left.count ?? 0))
    .flatMap((tag) => {
      const name = canonicalGenre(tag.name ?? '');
      if (!name || seen.has(name.toLowerCase())) return [];
      seen.add(name.toLowerCase());
      return [{ name, sources: ['MusicBrainz'] as GenreHit['sources'] }];
    })
    .slice(0, 6);
}

export type MusicBrainzOptions = {
  limiter: RateLimiter;
  fetchImpl?: typeof fetch;
};

export function createMusicBrainzProvider({
  limiter,
  fetchImpl,
}: MusicBrainzOptions): GenreProvider {
  const search = <T extends SearchResponse>(path: string, query: string) =>
    fetchJson<T>(
      `https://musicbrainz.org/ws/2/${path}/?query=${encodeURIComponent(query)}&fmt=json&limit=5`,
      { limiter, fetchImpl },
    );

  const byArtist = async (group: LookupGroup): Promise<GenreHit[]> => {
    const data = await search<SearchResponse>('artist', `artist:"${primaryArtist(group.artist)}"`);
    const best = (data.artists ?? []).sort(
      (left, right) =>
        similarity(group.artist, right.name ?? '') - similarity(group.artist, left.name ?? ''),
    )[0];
    return tagsToHits(best?.tags);
  };

  return {
    id: 'musicbrainz',
    label: 'MusicBrainz',
    priority: 20,
    async lookup(group: LookupGroup): Promise<ProviderResult> {
      try {
        if (group.kind === 'album' && group.album) {
          const data = await search<SearchResponse>(
            'release-group',
            `releasegroup:"${group.album}" AND artist:"${primaryArtist(group.artist)}"`,
          );
          const best = (data['release-groups'] ?? [])
            .map((entity) => ({
              entity,
              score:
                similarity(group.album ?? '', entity.title ?? '') * 0.65 +
                similarity(group.artist, artistCredit(entity)) * 0.35,
            }))
            .sort((left, right) => right.score - left.score)[0];
          if (!best || best.score < 0.6) return { genres: [] };
          return { genres: tagsToHits(best.entity.tags) };
        }

        if (group.tracks.length === 1) {
          const track = group.tracks[0];
          const data = await search<SearchResponse>(
            'recording',
            `recording:"${cleanSearchTitle(track.title)}" AND artist:"${primaryArtist(track.artist)}"`,
          );
          const hits = tagsToHits(data.recordings?.[0]?.tags);
          if (hits.length) return { genres: hits };
        }

        return { genres: await byArtist(group) };
      } catch (error) {
        return { genres: [], error: describe(error) };
      }
    },
  };
}
