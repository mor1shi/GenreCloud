import type { Track } from '../music';
import { normalizeText } from '../music';

export type GroupKind = 'album' | 'artist' | 'track';

export type LookupGroup = {
  key: string;
  kind: GroupKind;
  artist: string;
  album?: string;
  title?: string;
  tracks: Track[];
};

/**
 * Requests are made per artist+album, because catalog genres describe a
 * release (and its artist), not an individual track. Tracks without an album
 * are grouped by artist; a group that ends up with a single track keeps the
 * title so providers can fall back to a track-level search.
 */
export function groupTracks(tracks: Track[]): LookupGroup[] {
  const groups = new Map<string, LookupGroup>();

  for (const track of tracks) {
    const artistKey = normalizeText(track.artist);
    const albumKey = track.album ? normalizeText(track.album) : '';
    const kind: GroupKind = albumKey ? 'album' : 'artist';
    const key = albumKey ? `album:${artistKey}::${albumKey}` : `artist:${artistKey}`;
    const existing = groups.get(key);
    if (existing) {
      existing.tracks.push(track);
      if (existing.tracks.length > 1) existing.title = undefined;
      continue;
    }
    groups.set(key, {
      key,
      kind,
      artist: track.artist,
      album: track.album,
      title: track.title,
      tracks: [track],
    });
  }

  return [...groups.values()].sort(
    (left, right) => right.tracks.length - left.tracks.length || left.key.localeCompare(right.key),
  );
}

/** A single-track artist group can fall back to a track search. */
export function groupTitle(group: LookupGroup): { title: string } | Record<string, never> {
  return group.kind === 'album'
    ? {}
    : group.tracks.length === 1
      ? { title: group.tracks[0].title }
      : {};
}
