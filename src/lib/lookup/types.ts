import type { CatalogSource, GenreHit, Track } from '../music';

export type ProviderId = 'discogs' | 'musicbrainz' | 'spotify';

export type ProviderResult = {
  genres: GenreHit[];
  error?: string;
};

/** Genre lookup for one artist/album group, shared by every track in it. */
export interface GenreProvider {
  id: ProviderId;
  label: string;
  /** Higher priority sources are used first when several return genres. */
  priority: number;
  lookup: (group: import('./groups').LookupGroup, signal?: AbortSignal) => Promise<ProviderResult>;
}

export type TrackLookup = {
  track: Track;
  genres: GenreHit[];
  errors: Partial<Record<CatalogSource, string>>;
  checked: boolean;
};
