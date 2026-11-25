import type { Track, TrackResult } from '../../music';
import { stableTrackId } from '../../music';
import type { Settings } from '../../settings';
import { SpotifyError, type SpotifyClient } from './client';
import { createSpotifyClientFor } from './source';
import { createSpotifyProviderFromClient } from './provider';

export type PrefillOptions = {
  onPartial?: (results: TrackResult[]) => void;
  client?: SpotifyClient;
};

/**
 * Spotify genres describe the artist, so one request per unique artist.id is
 * enough. Groups that get genres are marked checked and keep the catalogs
 * untouched; groups without genres stay unchecked for Discogs/MusicBrainz.
 */
export async function prefillSpotifyGenres(
  tracks: Track[],
  existing: TrackResult[],
  settings: Settings,
  { onPartial, client: injectedClient }: PrefillOptions = {},
): Promise<TrackResult[]> {
  const client = injectedClient ?? (await createSpotifyClientFor(settings));
  const provider = createSpotifyProviderFromClient(client);
  const results = new Map(existing.map((result) => [stableTrackId(result.track), result]));

  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    if (track.source !== 'spotify' || !track.artistId) continue;
    if (results.get(stableTrackId(track))?.checked) continue;
    const list = groups.get(track.artistId) ?? [];
    list.push(track);
    groups.set(track.artistId, list);
  }

  for (const [artistId, groupTracks] of groups) {
    const group = {
      key: `artist:${artistId}`,
      kind: 'artist' as const,
      artist: groupTracks[0].artist,
      tracks: groupTracks,
    };
    try {
      const { genres } = await provider.lookup(group);
      if (genres.length) {
        for (const track of groupTracks) {
          results.set(stableTrackId(track), {
            track,
            genres,
            status: 'matched',
            checked: true,
          });
        }
      }
    } catch (error) {
      if (error instanceof SpotifyError && (error.status === 401 || error.status === 403)) {
        throw error;
      }
      // Transient failures fall through to the catalog providers.
    }
    onPartial?.([...results.values()]);
  }

  return [...results.values()];
}
