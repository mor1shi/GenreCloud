export type SpotifyArtist = {
  id: string;
  name: string;
  genres?: string[];
};

export type SpotifyTrackObject = {
  id?: string;
  name?: string;
  is_local?: boolean;
  artists?: Array<{ id?: string; name?: string }>;
  album?: { name?: string };
  external_urls?: { spotify?: string };
};

export type SavedTrackPage = {
  items?: Array<{ track?: SpotifyTrackObject | null }>;
  next?: string | null;
  total?: number;
};

export class SpotifyError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
  }
}

export type SpotifyClientOptions = {
  token: () => Promise<string>;
  refresh: () => Promise<string>;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
  /** Requests per second; Spotify has no published fixed limit for Web API. */
  intervalMs?: number;
};

export type SpotifyClient = {
  savedTracks: () => AsyncGenerator<SpotifyTrackObject>;
  artist: (id: string) => Promise<SpotifyArtist>;
};

export async function createSpotifyClient({
  token,
  refresh,
  fetchImpl = fetch,
  baseUrl = 'https://api.spotify.com/v1',
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  intervalMs = 250,
}: SpotifyClientOptions): Promise<SpotifyClient> {
  let lastRequest = 0;
  let current = await token();

  const request = async <T>(path: string): Promise<T> => {
    let refreshed = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const wait = Math.max(0, lastRequest + intervalMs - Date.now());
      if (wait > 0) await sleep(wait);
      lastRequest = Date.now();

      const response = await fetchImpl(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${current}`, Accept: 'application/json' },
      });

      if (response.status === 401 && !refreshed) {
        refreshed = true;
        current = await refresh();
        continue;
      }
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1));
        continue;
      }
      if (!response.ok) {
        throw new SpotifyError(
          `Spotify request failed (HTTP ${response.status}).`,
          response.status,
        );
      }
      return (await response.json()) as T;
    }
    throw new SpotifyError('Spotify is rate limiting requests.', 429);
  };

  return {
    async *savedTracks() {
      let offset = 0;
      for (let page = 0; page < 1000; page += 1) {
        const data = await request<SavedTrackPage>(`/me/tracks?limit=50&offset=${offset}`);
        const items = data.items ?? [];
        for (const item of items) {
          if (item.track && !item.track.is_local) yield item.track;
        }
        if (!data.next || !items.length) return;
        offset += items.length;
      }
    },
    artist: (id: string) => request<SpotifyArtist>(`/artists/${encodeURIComponent(id)}`),
  };
}
