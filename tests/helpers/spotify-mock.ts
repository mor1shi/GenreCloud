import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export type SpotifyMock = {
  accountsBase: string;
  apiBase: string;
  calls: { tracks: number; artists: number; tokens: number; refreshes: number };
  close: () => Promise<void>;
};

export async function startSpotifyMock(): Promise<SpotifyMock> {
  const calls = { tracks: 0, artists: 0, tokens: 0, refreshes: 0 };
  let limited = false;

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      response.writeHead(status, { 'content-type': 'application/json', ...headers });
      response.end(JSON.stringify(body));
    };

    if (request.method === 'POST' && url.pathname === '/api/token') {
      let raw = '';
      request.on('data', (chunk) => (raw += chunk));
      request.on('end', () => {
        calls.tokens += 1;
        const params = new URLSearchParams(raw);
        if (params.get('grant_type') === 'refresh_token') {
          calls.refreshes += 1;
          send(200, {
            access_token: 'access-2',
            refresh_token: 'refresh-2',
            expires_in: 3600,
          });
          return;
        }
        if (params.get('code') !== 'code1' || !params.get('code_verifier')) {
          send(400, { error: 'invalid_grant' });
          return;
        }
        send(200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 });
      });
      return;
    }

    const auth = request.headers.authorization ?? '';
    if (url.pathname.startsWith('/v1/')) {
      if (!auth.startsWith('Bearer ') || auth === 'Bearer old') {
        send(401, { error: { status: 401, message: 'The access token expired' } });
        return;
      }
    }

    if (url.pathname.startsWith('/v1/forbidden')) {
      send(403, { error: { status: 403 } });
      return;
    }

    if (url.pathname === '/v1/me/tracks') {
      calls.tracks += 1;
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const items = Array.from({ length: Math.min(limit, 120 - offset) }, (_, index) => {
        const position = offset + index;
        return {
          track: {
            id: `sp${position}`,
            name: `Song ${position}`,
            is_local: false,
            artists: [{ id: `ar${position % 7}`, name: `Artist ${position % 7}` }],
            album: { name: `Album ${Math.floor(position / 10)}` },
            external_urls: { spotify: `https://open.spotify.com/track/sp${position}` },
          },
        };
      });
      send(200, {
        items,
        next: offset + items.length < 120 ? 'next' : null,
        total: 120,
      });
      return;
    }

    const artist = url.pathname.match(/^\/v1\/artists\/(.+)$/);
    if (artist) {
      calls.artists += 1;
      const id = decodeURIComponent(artist[1]);
      if (id === 'ar6' && !limited) {
        limited = true;
        send(429, { error: { status: 429 } }, { 'Retry-After': '0' });
        return;
      }
      const genres = id === 'ar0' ? ['shoegaze', 'dream pop'] : id === 'ar1' ? [] : ['rock'];
      send(200, { id, name: `Artist ${id}`, genres });
      return;
    }

    send(404, { error: 'not found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  return {
    accountsBase: base,
    apiBase: `${base}/v1`,
    calls,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
