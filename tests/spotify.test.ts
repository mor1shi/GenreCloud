import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startSpotifyMock, type SpotifyMock } from './helpers/spotify-mock';
import { installFakeStorage } from './helpers/fake-storage';
import {
  connectSpotify,
  disconnectSpotify,
  getSpotifyAccessToken,
  isSpotifyConnected,
  loadSpotifyTokens,
  spotifyRedirectUrl,
  TOKENS_KEY,
} from '../src/lib/sources/spotify/auth';
import { createSpotifyClient } from '../src/lib/sources/spotify/client';
import { createSpotifySource } from '../src/lib/sources/spotify/source';
import { prefillSpotifyGenres } from '../src/lib/sources/spotify/prefill';
import { writeLocal } from '../src/lib/storage';
import { aggregateGenres, type Track } from '../src/lib/music';
import { DEFAULT_SETTINGS } from '../src/lib/settings';

let server: SpotifyMock;

beforeEach(async () => {
  installFakeStorage();
  server = await startSpotifyMock();
});

afterEach(async () => {
  await server.close();
});

describe('Spotify auth (PKCE)', () => {
  it('exchanges a code and stores tokens', async () => {
    let authorizeUrl = '';
    const redirectUri = 'https://extension.chromiumapp.org/';
    const tokens = await connectSpotify({
      clientId: 'client-id',
      accountsBase: server.accountsBase,
      redirectUrl: redirectUri,
      launch: async (url) => {
        authorizeUrl = url;
        const state = new URL(url).searchParams.get('state') ?? '';
        return `${redirectUri}?code=code1&state=${state}`;
      },
    });

    const params = new URL(authorizeUrl).searchParams;
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('scope')).toBe('user-library-read');
    expect(params.get('redirect_uri')).toBe(redirectUri);
    expect(tokens.accessToken).toBe('access-1');
    expect(await isSpotifyConnected()).toBe(true);
    expect((await loadSpotifyTokens())?.refreshToken).toBe('refresh-1');

    await disconnectSpotify();
    expect(await isSpotifyConnected()).toBe(false);
  });

  it('refreshes an expired access token', async () => {
    await writeLocal(TOKENS_KEY, {
      accessToken: 'expired',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() - 1000,
    });
    const token = await getSpotifyAccessToken({
      clientId: 'client-id',
      accountsBase: server.accountsBase,
    });
    expect(token).toBe('access-2');
  });

  it('rejects a mismatched state', async () => {
    await expect(
      connectSpotify({
        clientId: 'client-id',
        accountsBase: server.accountsBase,
        redirectUrl: 'https://extension.chromiumapp.org/',
        launch: async () => 'https://extension.chromiumapp.org/?code=code1&state=wrong',
      }),
    ).rejects.toThrow(/state/);
  });

  it('exposes the identity redirect URL when available', () => {
    (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
      ...(globalThis as { chrome?: object }).chrome,
      identity: { getRedirectURL: () => 'https://extension.chromiumapp.org/' },
    };
    expect(spotifyRedirectUrl()).toBe('https://extension.chromiumapp.org/');
  });
});

describe('Spotify Web API client', () => {
  const client = (overrides: Partial<Parameters<typeof createSpotifyClient>[0]> = {}) =>
    createSpotifyClient({
      token: async () => 'access-1',
      refresh: async () => 'access-2',
      baseUrl: server.apiBase,
      intervalMs: 0,
      sleep: async () => undefined,
      ...overrides,
    });

  it('paginates saved tracks by 50', async () => {
    const api = await client();
    const tracks = [];
    for await (const track of api.savedTracks()) tracks.push(track);
    expect(tracks).toHaveLength(120);
    expect(new Set(tracks.map((track) => track.id)).size).toBe(120);
    expect(server.calls.tracks).toBe(3);
  });

  it('refreshes once on 401', async () => {
    let refreshes = 0;
    const api = await client({
      token: async () => 'old',
      refresh: async () => {
        refreshes += 1;
        return 'new';
      },
    });
    const artist = await api.artist('ar0');
    expect(artist.genres).toContain('shoegaze');
    expect(refreshes).toBe(1);
  });

  it('retries 429 using Retry-After', async () => {
    const api = await client();
    const artist = await api.artist('ar6');
    expect(artist.id).toBe('ar6');
    expect(server.calls.artists).toBeGreaterThanOrEqual(2);
  });

  it('surfaces 403 as an error', async () => {
    const api = await createSpotifyClient({
      token: async () => 'access-1',
      refresh: async () => 'access-2',
      baseUrl: `${server.apiBase}/forbidden`,
      intervalMs: 0,
    });
    await expect(api.artist('x')).rejects.toThrow();
  });
});

const settings = {
  ...DEFAULT_SETTINGS,
  enableSpotify: true,
  spotifyClientId: 'client-id',
};

async function seedTokens() {
  await writeLocal(TOKENS_KEY, {
    accessToken: 'access-ok',
    refreshToken: 'refresh-1',
    expiresAt: Date.now() + 3600_000,
  });
}

describe('Spotify source and end-to-end flow', () => {
  it('collects, prefills artist genres and builds a cloud', async () => {
    await seedTokens();
    const source = createSpotifySource(settings, {
      baseUrl: server.apiBase,
      intervalMs: 0,
      sleep: async () => undefined,
    });
    const progress: number[] = [];
    const tracks = await source.collectFavorites((count) => progress.push(count));
    expect(tracks).toHaveLength(120);
    expect(tracks[0].artistId).toBe('ar0');
    expect(tracks[0].spotifyUrl).toContain('open.spotify.com');
    expect(progress.length).toBeGreaterThan(0);

    const spotifyClient = await createSpotifyClient({
      token: async () => 'access-ok',
      refresh: async () => 'access-ok',
      baseUrl: server.apiBase,
      intervalMs: 0,
    });
    const results = await prefillSpotifyGenres(
      tracks as Track[],
      [],
      settings,
      { client: spotifyClient },
    );
    const counts = aggregateGenres(results);
    expect(counts.find((genre) => genre.name === 'Shoegaze')?.count).toBeGreaterThan(0);
    expect(counts.some((genre) => genre.sources.includes('Spotify'))).toBe(true);
  });
});
