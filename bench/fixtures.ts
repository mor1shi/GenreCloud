import type { Track } from '../src/lib/music';

const ARTISTS = [
  'Ash Meridian',
  'Blue Harbour',
  'Cobalt Youth',
  'Delta Fields',
  'Ember Signal',
  'Fallow Coast',
  'Glass Orchard',
  'Hollow North',
  'Ivory Static',
  'June Assembly',
  'Kite Theory',
  'Lowlands',
  'Mono Lake',
  'Night Archive',
  'Open Season',
  'Paper Transit',
  'Quiet Engines',
  'River Sample',
  'Silver Fence',
  'Tidal Range',
];

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/** Stable pseudo-random decision, used to keep the fixture deterministic. */
export function bucket(key: string, slots: number): number {
  return hash(key) % slots;
}

export type LibraryFixture = {
  tracks: Track[];
  albumGroups: number;
  artistGroups: number;
  albumsWithoutDiscogs: number;
  singlesWithoutAlbum: number;
};

/**
 * 686 likes spread over 180 albums (3–4 tracks each) plus 26 albumless
 * singles, matching the shape of a real 700-track library.
 */
export function buildLibraryFixture(): LibraryFixture {
  const tracks: Track[] = [];
  let id = 1;

  for (const artist of ARTISTS) {
    for (let albumIndex = 0; albumIndex < 10; albumIndex += 1) {
      const album = `${artist.split(' ')[0]} Sessions ${albumIndex + 1}`;
      const size = albumIndex % 2 === 0 ? 4 : 3;
      for (let trackIndex = 0; trackIndex < size && tracks.length < 660; trackIndex += 1) {
        tracks.push({
          id: `t${id++}`,
          title: `Track ${trackIndex + 1} of ${album}`,
          artist,
          album,
          yandexGenre: 'rock',
          source: 'yandex',
        });
      }
    }
  }

  const singlesWithoutAlbum = 26;
  for (let index = 0; index < singlesWithoutAlbum; index += 1) {
    tracks.push({
      id: `s${id++}`,
      title: `Single ${index + 1}`,
      artist: ARTISTS[index % ARTISTS.length],
      yandexGenre: 'pop',
      source: 'yandex',
    });
  }

  const albumKeys = new Map<string, string>();
  for (const track of tracks) {
    if (track.album) albumKeys.set(`${track.artist}::${track.album}`, track.album);
  }
  const albumsWithoutDiscogs = [...albumKeys.keys()].filter(
    (key) => bucket(`discogs:${key}`, 10) === 0,
  ).length;

  return {
    tracks,
    albumGroups: albumKeys.size,
    artistGroups: new Set(
      tracks.filter((track) => !track.album).map((track) => track.artist),
    ).size,
    albumsWithoutDiscogs,
    singlesWithoutAlbum,
  };
}

export function discogsStyles(artist: string, album?: string, title?: string): string[] {
  const key = album ? `${artist}::${album}` : `${artist}::${title ?? ''}`;
  if (bucket(`discogs:${key}`, 10) === 0) return [];
  return bucket(`style:${key}`, 2) === 0 ? ['Shoegaze', 'Indie Rock'] : ['Art Rock'];
}

export function musicBrainzTags(artist: string, album?: string): string[] {
  const key = album ? `${artist}::${album}` : artist;
  if (bucket(`mb:${key}`, 10) < 2) return ['dream pop', 'shoegaze'];
  return [];
}
