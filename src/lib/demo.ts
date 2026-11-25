import type { CatalogSource, Track, TrackResult } from './music';

type DemoAlbum = {
  artist: string;
  album: string;
  genres: string[];
  source?: CatalogSource;
  tracks: string[];
};

/**
 * Fictional artists and releases. Nothing here maps to a real catalog entry;
 * the genre sets exist only to exercise the UI and the exports.
 */
const DEMO_ALBUMS: DemoAlbum[] = [
  {
    artist: 'Static Meadow',
    album: 'Paper Lanterns',
    genres: ['Shoegaze', 'Dream Pop'],
    tracks: ['Paper Lanterns', 'Slow Static', 'Afterglow', 'Gauze'],
  },
  {
    artist: 'Velvet Transit',
    album: 'Night Lines',
    genres: ['Synthpop', 'New Wave'],
    tracks: ['Night Lines', 'Terminal Blue', 'Second Platform'],
  },
  {
    artist: 'Harbor Lights',
    album: 'Low Tide',
    genres: ['Ambient', 'Post-Rock'],
    source: 'MusicBrainz',
    tracks: ['Low Tide', 'Salt', 'Breakwater', 'Distant Buoy'],
  },
  {
    artist: 'Nine Lanterns',
    album: 'Field Notes',
    genres: ['Folk', 'Singer-Songwriter'],
    tracks: ['Field Notes', 'River Stone', 'Winter Coat'],
  },
  {
    artist: 'Cobalt Rooms',
    album: 'Concrete Garden',
    genres: ['Techno', 'IDM'],
    tracks: ['Concrete Garden', 'Glass Corridor', 'Service Stair', 'Night Shift'],
  },
  {
    artist: 'Mira Vale',
    album: 'Small Hours',
    genres: ['Jazz', 'Soul'],
    tracks: ['Small Hours', 'Blue Room', 'Late Reply'],
  },
  {
    artist: 'The Quiet Index',
    album: 'Reference Copy',
    genres: ['Post-Punk', 'Indie Rock'],
    tracks: ['Reference Copy', 'Margin Note', 'Cross Reference'],
  },
  {
    artist: 'Aster Bloom',
    album: 'Signal Flowers',
    genres: ['Dream Pop', 'Shoegaze'],
    tracks: ['Signal Flowers', 'Half Light', 'Soft Error'],
  },
  {
    artist: 'Dust Cartography',
    album: 'Interior Maps',
    genres: ['Ambient', 'Experimental'],
    source: 'MusicBrainz',
    tracks: ['Interior Maps', 'Threshold', 'Unnamed Room'],
  },
  {
    artist: 'Rook & Reel',
    album: 'Tavern Songs',
    genres: ['Folk'],
    tracks: ['Tavern Songs', 'Copper Coin', 'The Long Road'],
  },
  {
    artist: 'Neon Orchard',
    album: 'Ripe',
    genres: ['House', 'Electronic'],
    tracks: ['Ripe', 'Orchard Gate', 'Pulp', 'Juice'],
  },
  {
    artist: 'Silver Kite',
    album: 'Updraft',
    genres: ['Indie Rock', 'Art Rock'],
    tracks: ['Updraft', 'String Theory', 'Weather Balloon'],
  },
  {
    artist: 'Mono Lake',
    album: 'Dry Season',
    genres: ['Post-Rock', 'Ambient'],
    source: 'MusicBrainz',
    tracks: ['Dry Season', 'Tufa', 'Evaporation'],
  },
  {
    artist: 'Partial Eclipse',
    album: 'Umbra',
    genres: ['Doom Metal', 'Metal'],
    tracks: ['Umbra', 'Penumbra', 'Iron Light'],
  },
  {
    artist: 'Rue Miel',
    album: 'Correspondence',
    genres: ['Trip Hop', 'Downtempo'],
    tracks: ['Correspondence', 'Poste Restante', 'Honey Letters'],
  },
  {
    artist: 'Ink Well',
    album: 'Draft Nine',
    genres: ['Hip Hop', 'Instrumental'],
    tracks: ['Draft Nine', 'Blue Pencil', 'Rewrite'],
  },
  {
    artist: 'Fathom Line',
    album: 'Sonar',
    genres: ['Drum and Bass', 'Electronic'],
    tracks: ['Sonar', 'Depth Charge', 'Ping'],
  },
  {
    artist: 'The Civic',
    album: 'Municipal',
    genres: ['Punk', 'Post-Punk'],
    tracks: ['Municipal', 'Planning Permission', 'Notice Board'],
  },
  {
    artist: 'Glass Atrium',
    album: 'Daylight Study',
    genres: ['Classical', 'Modern Classical'],
    tracks: ['Daylight Study', 'Etude for Window', 'Noon'],
  },
  {
    artist: 'Northbound',
    album: 'Platform Zero',
    genres: ['Soundtrack', 'Ambient'],
    tracks: ['Platform Zero', 'Departure Board', 'Last Train'],
  },
  {
    artist: 'Oval Season',
    album: 'Annual',
    genres: ['Art Rock', 'Indie Rock'],
    tracks: ['Annual', 'Growth Ring', 'Late Bloom'],
  },
  {
    artist: 'Quiet Servers',
    album: 'Uptime',
    genres: ['IDM', 'Ambient'],
    source: 'MusicBrainz',
    tracks: ['Uptime', 'Heartbeat', 'Failover'],
  },
  {
    artist: 'Sable Court',
    album: 'Hearsay',
    genres: ['Soul', 'Jazz'],
    tracks: ['Hearsay', 'Second Hand', 'Alibi'],
  },
  {
    artist: 'Copper Wren',
    album: 'Nest',
    genres: ['Folk', 'Singer-Songwriter'],
    tracks: ['Nest', 'Feather', 'Thin Ice', 'Spring'],
  },
  {
    artist: 'Void Gardens',
    album: 'Cultivation',
    genres: ['Techno', 'Experimental'],
    tracks: ['Cultivation', 'Hydroponics', 'Night Bloom'],
  },
  {
    artist: 'Last Ferry',
    album: 'Crossing',
    genres: ['Post-Rock', 'Shoegaze'],
    tracks: ['Crossing', 'Wake', 'Harbour Wall'],
  },
];

const UNMATCHED = [
  { artist: 'Unknown Field', album: 'Private Press', title: 'Untitled One' },
  { artist: 'Unknown Field', album: 'Private Press', title: 'Untitled Two' },
  { artist: 'Local Choir', album: 'Live at the Hall', title: 'Recording A' },
  { artist: 'Local Choir', album: 'Live at the Hall', title: 'Recording B' },
  { artist: 'Basement Tape', album: 'Side A', title: 'Demo 1' },
];

function trackId(artist: string, title: string): string {
  return `demo-${artist.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`;
}

export function buildDemoResults(): TrackResult[] {
  const results: TrackResult[] = [];

  for (const album of DEMO_ALBUMS) {
    for (const title of album.tracks) {
      const track: Track = {
        id: trackId(album.artist, title),
        title,
        artist: album.artist,
        album: album.album,
        source: 'yandex',
      };
      results.push({
        track,
        genres: album.genres.map((name) => ({
          name,
          sources: [album.source ?? 'Discogs'],
        })),
        status: 'matched',
        checked: true,
      });
    }
  }

  for (const item of UNMATCHED) {
    results.push({
      track: {
        id: trackId(item.artist, item.title),
        title: item.title,
        artist: item.artist,
        album: item.album,
        source: 'yandex',
      },
      genres: [],
      status: 'unmatched',
      checked: true,
    });
  }

  results.push({
    track: {
      id: 'demo-catalog-error',
      title: 'Offline Sample',
      artist: 'Static Meadow',
      album: 'Paper Lanterns',
      source: 'yandex',
    },
    genres: [],
    status: 'error',
    checked: true,
    errors: { Discogs: 'HTTP 503' },
  });

  return results;
}
