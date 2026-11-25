import type { Track } from '../music';

export type SourceId = 'yandex' | 'spotify';

/**
 * A music library the user can collect favourites from. The Yandex adapter is
 * built in; the Spotify adapter lives in its own module and is loaded only
 * when enabled.
 */
export interface MusicSource {
  id: SourceId;
  label: string;
  collectFavorites: (onProgress?: (count: number) => void) => Promise<Track[]>;
}
