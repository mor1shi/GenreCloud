import type { CatalogSource, Track, TrackResult } from './music';

/**
 * Storage layout. The key keeps its historical name so existing users do not
 * lose their library when the product is renamed; only the payload is
 * versioned and migrated.
 */
export const LIBRARY_KEY = 'genre-cloud-library-v1';
export const LIBRARY_SCHEMA_VERSION = 2;

export type StoredLibrary = {
  schemaVersion: number;
  savedAt: string | null;
  results: TrackResult[];
};

export function emptyLibrary(): StoredLibrary {
  return { schemaVersion: LIBRARY_SCHEMA_VERSION, savedAt: null, results: [] };
}

const SOURCES: CatalogSource[] = ['Yandex', 'MusicBrainz', 'Discogs', 'Spotify'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function migrateTrack(value: unknown): Track | null {
  if (!isRecord(value)) return null;
  const title = asString(value.title).trim();
  const artist = asString(value.artist).trim();
  if (!title || !artist) return null;
  const source = value.source === 'spotify' ? 'spotify' : value.source === 'yandex' ? 'yandex' : 'yandex';
  return {
    id: asString(value.id),
    title,
    artist,
    album: asString(value.album) || undefined,
    yandexGenre: asString(value.yandexGenre) || undefined,
    artistId: asString(value.artistId) || undefined,
    spotifyUrl: asString(value.spotifyUrl) || undefined,
    source,
  };
}

function migrateResult(value: unknown): TrackResult | null {
  if (!isRecord(value)) return null;
  const track = migrateTrack(value.track);
  if (!track) return null;
  const genres = Array.isArray(value.genres)
    ? value.genres.flatMap((hit) => {
        if (!isRecord(hit)) return [];
        const name = asString(hit.name).trim();
        if (!name) return [];
        const sources = Array.isArray(hit.sources)
          ? hit.sources.filter((item): item is CatalogSource =>
              SOURCES.includes(item as CatalogSource),
            )
          : [];
        return [{ name, sources: sources.length ? sources : (['Yandex'] as CatalogSource[]) }];
      })
    : [];
  const status =
    value.status === 'matched' || value.status === 'unmatched' || value.status === 'error'
      ? value.status
      : genres.length
        ? 'matched'
        : 'unmatched';
  return {
    track,
    genres,
    status,
    checked: value.checked !== false,
    errors: isRecord(value.errors) ? (value.errors as TrackResult['errors']) : undefined,
  };
}

/**
 * Migrates both the legacy v1 payload ({ results, updatedAt }) and the
 * versioned v2 payload. Unknown or malformed entries are dropped instead of
 * failing the whole library.
 */
export function migrateLibrary(raw: unknown): StoredLibrary {
  if (!isRecord(raw)) return emptyLibrary();
  const results = Array.isArray(raw.results)
    ? raw.results.flatMap((item) => {
        const result = migrateResult(item);
        return result ? [result] : [];
      })
    : [];
  const savedAt = asString(raw.savedAt) || asString(raw.updatedAt) || null;
  return { schemaVersion: LIBRARY_SCHEMA_VERSION, savedAt, results };
}
