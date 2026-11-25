export type {
  CatalogSource,
  GenreHit,
  GenreCount,
  Track,
  TrackResult,
} from './lib/music';

import type { Track, TrackResult } from './lib/music';

export type GenreCloudCallbacks = {
  onCollect: () => Promise<Track[]>;
  onLookup: (
    tracks: Track[],
    onProgress: (done: number, total: number) => void,
    onPartial?: (results: TrackResult[]) => void,
  ) => Promise<TrackResult[]>;
  onRestore: () => Promise<TrackResult[]>;
  onExport: () => void;
  onClear: () => void;
  onCancel?: () => void;
};
