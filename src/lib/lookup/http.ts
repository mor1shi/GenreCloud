import type { RateLimiter } from './rate-limiter';

export class HttpError extends Error {
  status: number;
  retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const MAX_ATTEMPTS = 3;

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function backoff(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** (attempt - 1));
}

export type FetchJsonOptions = {
  limiter: RateLimiter;
  headers?: Record<string, string>;
  onResponseHeaders?: (headers: Headers) => void;
  fetchImpl?: typeof fetch;
  attempts?: number;
  timeoutMs?: number;
};

/**
 * Fetches JSON with rate limiting, exponential backoff and Retry-After
 * support. 401/403 are not retried: they mean a bad token or a signed-out
 * session, and repeating the request cannot fix that.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const {
    limiter,
    headers = {},
    onResponseHeaders,
    fetchImpl = fetch,
    attempts = MAX_ATTEMPTS,
    timeoutMs = 20_000,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await limiter.acquire();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      limiter.penalize(backoff(attempt));
      continue;
    }

    onResponseHeaders?.(response.headers);

    if (response.status === 401 || response.status === 403) {
      throw new HttpError('Authentication required', response.status);
    }
    if (response.status === 429 || response.status === 503) {
      const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
      limiter.penalize(retryAfter ?? backoff(attempt));
      lastError = new HttpError(`HTTP ${response.status}`, response.status, retryAfter);
      if (attempt === attempts) break;
      continue;
    }
    if (!response.ok) {
      throw new HttpError(`HTTP ${response.status}`, response.status);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new HttpError('Invalid JSON response', response.status);
    }
  }

  if (lastError instanceof HttpError) throw lastError;
  throw new HttpError('Network request failed', 0);
}
