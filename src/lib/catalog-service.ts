import {
  mergeGenreHits,
  normalizeText,
  type CatalogSource,
  type GenreHit,
  type Track,
  type TrackResult,
} from './music';

type MusicBrainzRecording = {
  id?: string;
  title?: string;
  score?: number;
  'artist-credit'?: Array<string | { name?: string; artist?: { id?: string; name?: string } }>;
  genres?: Array<{ name?: string }>;
};

type DiscogsRelease = {
  title?: string;
  genre?: string[];
  style?: string[];
  resource_url?: string;
};

type CatalogResult = { genres: string[]; error?: string };

type RemoteSource = Exclude<CatalogSource, 'Yandex'>;

const lastRequestAt: Record<RemoteSource, number> = {
  MusicBrainz: 0,
  Discogs: 0,
  Spotify: 0,
};
const cooldownUntil: Record<RemoteSource, number> = {
  MusicBrainz: 0,
  Discogs: 0,
  Spotify: 0,
};
const minimumInterval: Record<RemoteSource, number> = {
  // MusicBrainz asks for at most one request per second; 1.5 s leaves room
  // for its occasional 503 responses and avoids hammering the service.
  MusicBrainz: 1500,
  // Unauthenticated Discogs allows ~25 requests per minute.
  Discogs: 2700,
  Spotify: 200,
};
const MAX_ATTEMPTS = 3;

// Yandex keeps a single coarse genre slug per album. The map below turns those
// slugs into readable labels so the cloud can be rendered instantly, while the
// slower catalog lookups refine the result in the background.
const YANDEX_GENRE_LABELS: Record<string, string> = {
  rock: 'Rock',
  alternative: 'Alternative',
  indie: 'Indie',
  'local-indie': 'Indie',
  pop: 'Pop',
  rap: 'Rap',
  foreignrap: 'Hip Hop',
  rusrap: 'Russian Rap',
  russianrap: 'Russian Rap',
  numetal: 'Nu Metal',
  alternativemetal: 'Alternative Metal',
  heavymetal: 'Heavy Metal',
  metal: 'Metal',
  deathmetal: 'Death Metal',
  blackmetal: 'Black Metal',
  thrashmetal: 'Thrash Metal',
  doommetal: 'Doom Metal',
  punk: 'Punk',
  punkrock: 'Punk Rock',
  poprock: 'Pop Rock',
  hardrock: 'Hard Rock',
  postrock: 'Post-Rock',
  prog: 'Progressive Rock',
  progressive: 'Progressive Rock',
  electronics: 'Electronic',
  electronic: 'Electronic',
  triphopgenre: 'Trip Hop',
  triphop: 'Trip Hop',
  japanesepop: 'J-Pop',
  jazz: 'Jazz',
  blues: 'Blues',
  soul: 'Soul',
  funk: 'Funk',
  disco: 'Disco',
  reggae: 'Reggae',
  country: 'Country',
  folk: 'Folk',
  foreignbard: 'Bard',
  bard: 'Bard',
  shanson: 'Chanson',
  classical: 'Classical',
  classic: 'Classical',
  soundtrack: 'Soundtrack',
  house: 'House',
  techno: 'Techno',
  trance: 'Trance',
  ambient: 'Ambient',
  downtempo: 'Downtempo',
  idm: 'IDM',
  experimental: 'Experimental',
  noise: 'Noise',
  industrial: 'Industrial',
  gothic: 'Gothic',
  emo: 'Emo',
  screamo: 'Screamo',
  posthardcore: 'Post-Hardcore',
  hardcore: 'Hardcore',
  hiphop: 'Hip Hop',
  'hip-hop': 'Hip Hop',
  edm: 'EDM',
  dance: 'Dance',
  dubstep: 'Dubstep',
  dnb: 'Drum & Bass',
  drumandbass: 'Drum & Bass',
  breakbeat: 'Breakbeat',
  lounge: 'Lounge',
  opera: 'Opera',
  vocal: 'Vocal',
  instrumental: 'Instrumental',
  forchildren: 'Children',
  children: 'Children',
  humour: 'Humour',
  audiobook: 'Audiobook',
};

export function yandexGenreLabel(slug?: string): string | null {
  const key = slug?.trim().toLowerCase();
  if (!key) return null;
  const mapped = YANDEX_GENRE_LABELS[key];
  if (mapped) return mapped;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s-]*$/u.test(key)) return null;
  return key.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export function seedTrackResult(track: Track): TrackResult {
  const label = yandexGenreLabel(track.yandexGenre);
  return {
    track,
    genres: label ? [{ name: label, sources: ['Yandex'] }] : [],
    status: label ? 'matched' : 'unmatched',
    checked: false,
  };
}

class FatalRequestError extends Error {}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForSlot(source: RemoteSource): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(
    cooldownUntil[source] - now,
    minimumInterval[source] - (now - lastRequestAt[source]),
    0,
  );
  if (waitMs) await pause(waitMs);
  lastRequestAt[source] = Date.now();
}

function retryDelay(attempt: number): number {
  return Math.min(8000, 700 * 2 ** (attempt - 1)) + Math.random() * 250;
}

async function requestJson<T>(source: RemoteSource, url: string, timeoutMs = 15000): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await waitForSlot(source);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const status = response.status;
      if (status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        const seconds =
          Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) : 4;
        cooldownUntil[source] = Date.now() + seconds * 1000;
        throw new Error(`${source}: лимит запросов, повторяем через ${seconds} с.`);
      }
      if (status === 408 || status >= 500) {
        // A 503 from MusicBrainz usually means "slow down"; give the service
        // a slightly longer breather than the regular retry backoff.
        if (status === 503) cooldownUntil[source] = Date.now() + 4000;
        throw new Error(`${source} временно недоступен (код ${status}).`);
      }
      throw new FatalRequestError(`${source} ответил с кодом ${status}.`);
    } catch (error) {
      if (error instanceof FatalRequestError) throw error;
      if (attempt === MAX_ATTEMPTS) {
        throw error instanceof Error ? error : new Error(`${source}: запрос не удался.`);
      }
      await pause(retryDelay(attempt));
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw new Error(`${source}: запрос не удался.`);
}

export function cleanSearchTitle(title: string): string {
  const decoration =
    /remaster|remastered|live|version|edit|remix|mix|demo|mono|stereo|deluxe|bonus|soundtrack|\bost\b|prod|feat|ft\.|\bwith\b/i;
  let value = title.normalize('NFC').replace(/[«»“”„]/g, '"');
  value = value.replace(/\([^()]*\)|\[[^\]]*\]|\{[^}]*\}/g, (chunk) =>
    decoration.test(chunk) ? ' ' : chunk,
  );
  value = value.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i, ' ');
  value = value.replace(
    /\s+[-–—]\s+.*(?:remaster|live|version|edit|mix|demo|mono|stereo|deluxe|bonus).*$/i,
    ' ',
  );
  return (
    value
      .replace(/[.,;:!?…·•]+$/u, '')
      .replace(/\s+/g, ' ')
      .trim() || title.trim()
  );
}

function cleanGenres(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const name = value?.trim();
    const key = name ? normalizeText(name) : '';
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(name);
  }
  return output;
}

function artistCredit(recording: MusicBrainzRecording): string {
  return (recording['artist-credit'] ?? [])
    .map((item) => (typeof item === 'string' ? item : (item.name ?? item.artist?.name ?? '')))
    .filter(Boolean)
    .join(' ');
}

function primaryArtist(artist: string): string {
  // Do not split on "&": it is part of many duo names (Simon & Garfunkel).
  const first = artist
    .split(/,|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s|\sx\s/iu)
    .map((part) => part.trim())
    .find(Boolean);
  return first || artist;
}

function similarity(left: string, right: string): number {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.86;
  const aWords = new Set(a.split(' '));
  const bWords = new Set(b.split(' '));
  const common = [...aWords].filter((word) => bWords.has(word)).length;
  return common / Math.max(aWords.size, bWords.size);
}

async function lookupMusicBrainz(track: Track): Promise<CatalogResult> {
  try {
    const title = cleanSearchTitle(track.title);
    const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const query = `recording:"${quote(title)}" AND artist:"${quote(primaryArtist(track.artist))}"`;
    const searchUrl = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
    const search = await requestJson<{ recordings?: MusicBrainzRecording[] }>(
      'MusicBrainz',
      searchUrl,
    );
    const candidates = search.recordings ?? [];
    const candidate = candidates
      .map((recording) => ({
        recording,
        score:
          similarity(title, recording.title ?? '') * 0.55 +
          similarity(track.artist, artistCredit(recording)) * 0.45,
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (!candidate?.recording.id || candidate.score < 0.68) return { genres: [] };

    const details = await requestJson<MusicBrainzRecording>(
      'MusicBrainz',
      `https://musicbrainz.org/ws/2/recording/${encodeURIComponent(candidate.recording.id)}?inc=genres&fmt=json`,
    );
    return {
      genres: cleanGenres((details.genres ?? []).map((genre) => genre.name)),
    };
  } catch (error) {
    return {
      genres: [],
      error: error instanceof Error ? error.message : 'Ошибка MusicBrainz.',
    };
  }
}

async function lookupDiscogs(track: Track): Promise<CatalogResult> {
  try {
    const params = new URLSearchParams({
      type: 'release',
      track: cleanSearchTitle(track.title),
      artist: primaryArtist(track.artist),
      per_page: '8',
    });
    const search = await requestJson<{ results?: DiscogsRelease[] }>(
      'Discogs',
      `https://api.discogs.com/database/search?${params.toString()}`,
    );
    const candidate = (search.results ?? [])
      .map((release) => ({
        release,
        score: similarity(`${track.artist} ${track.title}`, release.title ?? ''),
      }))
      .sort((a, b) => b.score - a.score)[0];

    // Discogs filters by both track and artist; the release title itself often
    // names the album rather than the searched track, so it is not a safe score.
    if (!candidate) return { genres: [] };

    let genres = cleanGenres([
      ...(candidate.release.style ?? []),
      ...(candidate.release.genre ?? []),
    ]);
    if (!genres.length && candidate.release.resource_url) {
      const details = await requestJson<DiscogsRelease>('Discogs', candidate.release.resource_url);
      genres = cleanGenres([...(details.style ?? []), ...(details.genre ?? [])]);
    }
    return { genres };
  } catch (error) {
    return {
      genres: [],
      error: error instanceof Error ? error.message : 'Ошибка Discogs.',
    };
  }
}

export async function lookupTrackGenres(track: Track): Promise<TrackResult> {
  // Discogs answers with release-level styles and is the source of the
  // detailed map, so it is asked first. MusicBrainz is a slower, rate-limited
  // fallback and is only queried when Discogs found nothing; running both in
  // parallel doubled the load and produced a lot of 503 retries.
  const discogs = await lookupDiscogs(track);
  const musicBrainz: CatalogResult = discogs.genres.length
    ? { genres: [] }
    : await lookupMusicBrainz(track);
  // Discogs first: its genre names are properly capitalised and are used for
  // display when both catalogs return the same genre.
  const groups = [
    { source: 'Discogs' as const, genres: discogs.genres },
    { source: 'MusicBrainz' as const, genres: musicBrainz.genres },
  ];
  const catalogGenres = mergeGenreHits(groups);
  const fallback = yandexGenreLabel(track.yandexGenre);
  // Catalog styles are much more specific than the Yandex slug (Shoegaze vs
  // Rock), so they replace the seed instead of being merged with it.
  const genres: GenreHit[] = catalogGenres.length
    ? catalogGenres
    : fallback
      ? [{ name: fallback, sources: ['Yandex'] }]
      : [];

  const errors: Partial<Record<CatalogSource, string>> = {};
  if (musicBrainz.error) errors.MusicBrainz = musicBrainz.error;
  if (discogs.error) errors.Discogs = discogs.error;

  // A source failure is not a failure of the track when the other catalog
  // returned genres (or the Yandex fallback still describes it): that only
  // produced noisy "сбой каталога" badges before.
  return {
    track,
    genres,
    status: genres.length ? 'matched' : Object.keys(errors).length ? 'error' : 'unmatched',
    errors: genres.length ? undefined : errors,
    checked: true,
  };
}
