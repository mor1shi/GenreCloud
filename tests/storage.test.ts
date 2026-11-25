import { describe, expect, it } from 'vitest';
import { aggregateGenres } from '../src/lib/music';
import { migrateLibrary } from '../src/lib/storage-migration';

describe('library migration', () => {
  it('accepts the legacy { results, updatedAt } payload', () => {
    const library = migrateLibrary({
      updatedAt: '2026-01-01T00:00:00.000Z',
      results: [
        {
          track: { id: '1', title: 'Song', artist: 'Artist', album: 'Album' },
          genres: [{ name: 'Rock', sources: ['Yandex'] }],
          status: 'matched',
        },
      ],
    });
    expect(library.schemaVersion).toBe(2);
    expect(library.savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(library.results).toHaveLength(1);
    expect(library.results[0].track.title).toBe('Song');
    expect(library.results[0].checked).toBe(true);
  });

  it('drops malformed tracks but keeps valid ones', () => {
    const library = migrateLibrary({
      results: [
        { track: { title: '', artist: 'A' } },
        { track: { id: '2', title: 'Kept', artist: 'B' } },
        null,
      ],
    });
    expect(library.results).toHaveLength(1);
    expect(library.results[0].track.title).toBe('Kept');
  });

  it('returns an empty library for unknown payloads', () => {
    expect(migrateLibrary('nonsense').results).toEqual([]);
  });
});

describe('genre counting', () => {
  it('gives one vote per track, merges spelling variants and sorts', () => {
    const result = (id: string, names: string[]) => ({
      track: { id, title: id, artist: 'A' },
      status: 'matched' as const,
      genres: names.map((name) => ({ name, sources: ['Discogs' as const] })),
    });
    const counts = aggregateGenres([
      result('1', ['Hip Hop', 'hip-hop', 'Rock']),
      result('2', ['hip hop']),
      result('3', ['Ambient']),
    ]);
    expect(counts.map((item) => [item.name, item.count])).toEqual([
      ['Hip Hop', 2],
      ['Ambient', 1],
      ['Rock', 1],
    ]);
  });
});
