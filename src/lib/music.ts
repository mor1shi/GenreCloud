export type CatalogSource = 'MusicBrainz' | 'Discogs' | 'Yandex' | 'Spotify';

export type TrackSource = 'yandex' | 'spotify';

export type Track = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  /** Coarse genre from the Yandex album, used as an instant fallback. */
  yandexGenre?: string;
  /** Primary artist id used for per-artist genre lookups (Spotify). */
  artistId?: string;
  /** Link back to the track on Spotify, required for metadata attribution. */
  spotifyUrl?: string;
  source?: TrackSource;
};

export type GenreHit = {
  name: string;
  sources: CatalogSource[];
};

export type TrackResult = {
  track: Track;
  genres: GenreHit[];
  status: 'matched' | 'unmatched' | 'error';
  errors?: Partial<Record<CatalogSource, string>>;
  /** Catalog sources were queried; false means the result is only the Yandex seed. */
  checked?: boolean;
};

export type GenreCount = {
  name: string;
  count: number;
  sources: CatalogSource[];
};

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function stableTrackId(
  track: Pick<Track, 'title' | 'artist'> & Partial<Pick<Track, 'id'>>,
): string {
  // The Yandex track id is authoritative: the same song may legitimately be in
  // the library twice (single + album), and deduping by artist/title hides
  // those tracks and makes the collected count differ from "Мне нравится".
  return track.id
    ? `id:${track.id}`
    : `${normalizeText(track.artist)}::${normalizeText(track.title)}`;
}

export function aggregateGenres(results: TrackResult[]): GenreCount[] {
  const counts = new Map<string, GenreCount>();

  for (const result of results) {
    if (result.status !== 'matched') continue;

    const seenForTrack = new Set<string>();
    for (const hit of result.genres) {
      const normalized = normalizeText(hit.name);
      if (!normalized || seenForTrack.has(normalized)) continue;
      seenForTrack.add(normalized);

      const existing = counts.get(normalized);
      if (existing) {
        existing.count += 1;
        existing.sources = Array.from(
          new Set([...existing.sources, ...hit.sources]),
        );
      } else {
        counts.set(normalized, {
          name: hit.name.trim(),
          count: 1,
          sources: [...hit.sources],
        });
      }
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}

export function mergeGenreHits(
  groups: Array<{ source: CatalogSource; genres: string[] }>,
): GenreHit[] {
  const hits = new Map<string, GenreHit>();

  for (const { source, genres } of groups) {
    for (const rawName of genres) {
      const name = rawName.trim();
      const normalized = normalizeText(name);
      if (!normalized) continue;

      const existing = hits.get(normalized);
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
      } else {
        hits.set(normalized, { name, sources: [source] });
      }
    }
  }

  return [...hits.values()].sort((a, b) => a.name.localeCompare(b.name));
}
