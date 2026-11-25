import { readLocal, removeLocal, writeLocal } from '../../storage';
import { createPkcePair, randomState } from './pkce';

export const TOKENS_KEY = 'genrecloud-spotify-tokens-v1';
export const SPOTIFY_SCOPES = 'user-library-read';
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';

export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
};

type IdentityApi = {
  getRedirectURL: () => string;
  launchWebAuthFlow: (options: { url: string; interactive: boolean }) => Promise<string>;
};

function identityApi(): IdentityApi {
  const browser = (
    globalThis as typeof globalThis & {
      browser?: { identity?: IdentityApi };
      chrome?: {
        identity?: {
          getRedirectURL: () => string;
          launchWebAuthFlow: (
            options: { url: string; interactive: boolean },
            callback: (redirect?: string) => void,
          ) => void;
        };
      };
    }
  ).browser?.identity;
  if (browser) return browser;

  const chrome = (globalThis as typeof globalThis & { chrome?: { identity?: unknown } }).chrome
    ?.identity as
    | {
        getRedirectURL: () => string;
        launchWebAuthFlow: (
          options: { url: string; interactive: boolean },
          callback: (redirect?: string) => void,
        ) => void;
        runtime?: { lastError?: { message?: string } };
      }
    | undefined;
  if (!chrome) throw new Error('Spotify sign-in is not available in this browser.');
  return {
    getRedirectURL: () => chrome.getRedirectURL(),
    launchWebAuthFlow: (options) =>
      new Promise((resolve, reject) => {
        chrome.launchWebAuthFlow(options, (redirect) => {
          const runtime = (
            globalThis as typeof globalThis & {
              chrome?: { runtime?: { lastError?: { message?: string } } };
            }
          ).chrome?.runtime;
          if (!redirect || runtime?.lastError) {
            reject(new Error(runtime?.lastError?.message ?? 'Spotify sign-in was cancelled.'));
            return;
          }
          resolve(redirect);
        });
      }),
  };
}

export function spotifyRedirectUrl(): string {
  try {
    return identityApi().getRedirectURL();
  } catch {
    return '';
  }
}

export type SpotifyAuthDeps = {
  clientId: string;
  fetchImpl?: typeof fetch;
  accountsBase?: string;
  now?: () => number;
  redirectUrl?: string;
  launch?: (url: string) => Promise<string>;
};

function tokenEndpoint(deps: SpotifyAuthDeps): string {
  return `${deps.accountsBase ?? 'https://accounts.spotify.com'}/api/token`;
}

async function requestTokens(
  deps: SpotifyAuthDeps,
  body: Record<string, string>,
): Promise<SpotifyTokens> {
  const response = await (deps.fetchImpl ?? fetch)(tokenEndpoint(deps), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    throw new Error(`Spotify token request failed (HTTP ${response.status}).`);
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!data.access_token || !data.refresh_token) {
    throw new Error('Spotify did not return tokens.');
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: (deps.now ?? Date.now)() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope,
  };
}

export async function loadSpotifyTokens(): Promise<SpotifyTokens | null> {
  const value = await readLocal<SpotifyTokens>(TOKENS_KEY);
  if (!value?.accessToken || !value.refreshToken) return null;
  return value;
}

export async function isSpotifyConnected(): Promise<boolean> {
  return Boolean(await loadSpotifyTokens());
}

export async function connectSpotify(deps: SpotifyAuthDeps): Promise<SpotifyTokens> {
  const { verifier, challenge } = await createPkcePair();
  const state = randomState();
  const redirectUrl = deps.redirectUrl ?? spotifyRedirectUrl();
  if (!redirectUrl) throw new Error('Redirect URL is unavailable.');
  const launch =
    deps.launch ?? ((url: string) => identityApi().launchWebAuthFlow({ url, interactive: true }));

  const params = new URLSearchParams({
    client_id: deps.clientId,
    response_type: 'code',
    redirect_uri: redirectUrl,
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  const redirect = await launch(`${AUTHORIZE_URL}?${params.toString()}`);
  const result = new URL(redirect);
  if (result.searchParams.get('state') !== state) {
    throw new Error('Spotify returned an invalid state value.');
  }
  const error = result.searchParams.get('error');
  if (error) throw new Error(`Spotify sign-in failed: ${error}.`);
  const code = result.searchParams.get('code');
  if (!code) throw new Error('Spotify did not return an authorization code.');

  const tokens = await requestTokens(deps, {
    client_id: deps.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUrl,
    code_verifier: verifier,
  });
  await writeLocal(TOKENS_KEY, tokens);
  return tokens;
}

export async function refreshSpotifyTokens(deps: SpotifyAuthDeps): Promise<SpotifyTokens> {
  const current = await loadSpotifyTokens();
  if (!current) throw new Error('Spotify is not connected.');
  const tokens = await requestTokens(deps, {
    client_id: deps.clientId,
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
  });
  const merged = { ...tokens, refreshToken: tokens.refreshToken || current.refreshToken };
  await writeLocal(TOKENS_KEY, merged);
  return merged;
}

export async function getSpotifyAccessToken(deps: SpotifyAuthDeps): Promise<string> {
  const tokens = await loadSpotifyTokens();
  if (!tokens) throw new Error('Spotify is not connected.');
  const now = (deps.now ?? Date.now)();
  if (tokens.expiresAt - 60_000 > now) return tokens.accessToken;
  return (await refreshSpotifyTokens(deps)).accessToken;
}

export async function disconnectSpotify(): Promise<void> {
  await removeLocal(TOKENS_KEY);
}
