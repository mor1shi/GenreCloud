import { canonicalGenre } from '../../genres';
import type { GenreHit } from '../../music';
import type { LookupGroup } from '../../lookup/groups';
import type { GenreProvider, ProviderResult } from '../../lookup/types';
import type { SpotifyClient } from './client';

/**
 * Artist-level genres from the official Web API. The `genres` field is marked
 * deprecated by Spotify and can be empty, in which case the group falls back to
 * Discogs and MusicBrainz.
 */
export function createSpotifyProviderFromClient(client: SpotifyClient): GenreProvider {
  const cache = new Map<string, GenreHit[]>();
  return {
    id: 'spotify',
    label: 'Spotify',
    priority: 5,
    async lookup(group: LookupGroup): Promise<ProviderResult> {
      const artistId = group.tracks.find((track) => track.artistId)?.artistId;
      if (!artistId) return { genres: [] };
      if (cache.has(artistId)) return { genres: cache.get(artistId) ?? [] };

      const artist = await client.artist(artistId);
      const seen = new Set<string>();
      const hits: GenreHit[] = [];
      for (const raw of artist.genres ?? []) {
        const name = canonicalGenre(raw);
        const key = name.toLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        hits.push({ name, sources: ['Spotify'] });
        if (hits.length >= 6) break;
      }
      cache.set(artistId, hits);
      return { genres: hits };
    },
  };
}
