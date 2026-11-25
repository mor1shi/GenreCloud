import type { Track } from '../../music';
import { stableTrackId } from '../../music';
import type { MusicSource } from '../types';
import type { Settings } from '../../settings';
import { getSpotifyAccessToken, refreshSpotifyTokens } from './auth';
import { createSpotifyClient, type SpotifyClientOptions } from './client';

type ClientOverrides = Partial<Omit<SpotifyClientOptions, 'token' | 'refresh'>>;

export async function createSpotifyClientFor(
  settings: Settings,
  overrides: ClientOverrides = {},
) {
  const deps = { clientId: settings.spotifyClientId };
  return createSpotifyClient({
    token: () => getSpotifyAccessToken(deps),
    refresh: async () => (await refreshSpotifyTokens(deps)).accessToken,
    ...overrides,
  });
}

export function createSpotifySource(
  settings: Settings,
  overrides: ClientOverrides = {},
): MusicSource {
  return {
    id: 'spotify',
    label: 'Spotify',
    async collectFavorites(onProgress) {
      const client = await createSpotifyClientFor(settings, overrides);
      const tracks = new Map<string, Track>();
      for await (const item of client.savedTracks()) {
        const title = item.name?.trim();
        const artist = (item.artists ?? [])
          .map((entry) => entry.name?.trim())
          .filter(Boolean)
          .join(', ');
        if (!item.id || !title || !artist) continue;
        const track: Track = {
          id: `spotify:${item.id}`,
          title,
          artist,
          album: item.album?.name?.trim() || undefined,
          artistId: item.artists?.[0]?.id,
          spotifyUrl: item.external_urls?.spotify,
          source: 'spotify',
        };
        tracks.set(stableTrackId(track), track);
        if (tracks.size % 50 === 0) onProgress?.(tracks.size);
      }
      return [...tracks.values()];
    },
  };
}
