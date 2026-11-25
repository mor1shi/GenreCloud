import type { Track, TrackResult } from './music';
import { lookupTrackGenres, seedTrackResult } from './catalog-service';
import { stableTrackId } from './music';
import {
  LIBRARY_KEY,
  LIBRARY_SCHEMA_VERSION,
  migrateLibrary,
  type StoredLibrary,
} from './storage-migration';

type ExtensionTab = { id?: number; url?: string };
type TabQuery = {
  active?: boolean;
  currentWindow?: boolean;
  url?: string | string[];
};
// Callback signatures are supported by both Chrome and Firefox, including
// Firefox's chrome.* namespace, while promises are not guaranteed there.
type StorageArea = {
  get: (keys: string | string[], callback: (values: Record<string, unknown>) => void) => void;
  set: (values: Record<string, unknown>, callback: () => void) => void;
  remove: (keys: string | string[], callback: () => void) => void;
};
type ChromeExtensionApi = {
  runtime?: { id?: string; lastError?: { message?: string } };
  tabs?: {
    query: (query: TabQuery, callback: (tabs: ExtensionTab[]) => void) => void;
    sendMessage: (
      tabId: number,
      message: { type: string },
      callback: (response: unknown) => void,
    ) => void;
  };
  scripting?: {
    executeScript: (injection: {
      target: { tabId: number };
      world?: 'MAIN' | 'ISOLATED';
      func: (base: string) => Promise<PageLikesResult>;
      args?: unknown[];
    }) => Promise<Array<{ result?: PageLikesResult }>>;
  };
  storage?: { local?: StorageArea };
};

type PageLikesResult = {
  tracks?: Track[];
  error?: string;
};

function getExtensionApi(): ChromeExtensionApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeExtensionApi }).chrome;
}

export function isExtensionRuntime(): boolean {
  return Boolean(getExtensionApi()?.runtime?.id);
}

function getStorage(): StorageArea {
  const storage = getExtensionApi()?.storage?.local;
  if (!storage) {
    throw new Error('Локальное хранилище доступно только в установленном расширении.');
  }
  return storage;
}

function callApi<T>(call: (callback: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      call((value) => {
        const error = getExtensionApi()?.runtime?.lastError;
        if (error) {
          reject(new Error(error.message ?? 'Ошибка расширения.'));
          return;
        }
        resolve(value);
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function loadStoredLibrary(): Promise<StoredLibrary> {
  const storage = getExtensionApi()?.storage?.local;
  if (!storage) return migrateLibrary(null);
  const stored = await callApi<Record<string, unknown>>((callback) =>
    storage.get(LIBRARY_KEY, callback),
  );
  return migrateLibrary(stored[LIBRARY_KEY]);
}

export async function saveStoredLibrary(results: TrackResult[]): Promise<void> {
  const storage = getStorage();
  await callApi<void>((callback) =>
    storage.set(
      {
        [LIBRARY_KEY]: {
          schemaVersion: LIBRARY_SCHEMA_VERSION,
          savedAt: new Date().toISOString(),
          results,
        } satisfies StoredLibrary,
      },
      callback,
    ),
  );
}

export async function clearStoredLibrary(): Promise<void> {
  const storage = getStorage();
  await callApi<void>((callback) => storage.remove(LIBRARY_KEY, callback));
}

export function exportLibraryJson(results: TrackResult[]): void {
  const payload = {
    exportedAt: new Date().toISOString(),
    countingRule: 'One contribution per liked track for each unique genre.',
    results,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'genrecloud-export.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

const YANDEX_MUSIC_URL = /^https:\/\/music\.yandex\.(ru|com|kz|by)\//;

// Runs inside the music site itself (world: MAIN), so its fetch carries the
// page's own cookies and origin. Firefox content-script fetches to the API
// come back as 401 even for a logged-in page, and Chrome may change the same
// behaviour at any time; the page context is the one place that always works.
// The function must stay self-contained: the browser serialises its source.
async function readLikesInPage(base: string): Promise<PageLikesResult> {
  const clean = (value: unknown) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s·•—-]+|[\s·•—-]+$/g, '')
      .trim();
  const request = async (path: string) => {
    const response = await fetch(`${base}${path}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error('Войдите в аккаунт Яндекс Музыки и повторите сбор.');
    }
    if (!response.ok) {
      throw new Error(`API Яндекс Музыки ответил с кодом ${response.status}.`);
    }
    return response.json();
  };
  try {
    const status = await request('/account/status');
    const uid = status?.result?.account?.uid;
    if (!uid) {
      throw new Error('Войдите в аккаунт Яндекс Музыки и повторите сбор.');
    }
    const likes = await request(`/users/${encodeURIComponent(String(uid))}/likes/tracks`);
    const items: Array<{ id?: string | number }> =
      likes?.result?.library?.tracks ?? likes?.result?.tracks ?? [];
    const ids = items
      .map((item) => (item?.id === undefined ? '' : String(item.id)))
      .filter(Boolean);
    const tracks: Track[] = [];
    for (let index = 0; index < ids.length; index += 50) {
      const idsParam = encodeURIComponent(ids.slice(index, index + 50).join(','));
      const data = await request(`/tracks?track-ids=${idsParam}&with-positions=false`);
      for (const track of data?.result ?? []) {
        const album = track.albums?.[0] ?? track.album;
        const title = clean(track.title);
        const artist = (track.artists ?? [])
          .map((item: { name?: string } | string) =>
            clean(typeof item === 'string' ? item : item?.name),
          )
          .filter(Boolean)
          .join(', ');
        if (!title || !artist) continue;
        tracks.push({
          id: String(track.id ?? ''),
          title,
          artist,
          album: clean(album?.title) || undefined,
          yandexGenre: clean(album?.genre) || undefined,
        });
      }
    }
    return { tracks };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function apiBaseForTab(url: string | undefined): string {
  return url?.includes('music.yandex.com')
    ? 'https://api.music.yandex.com'
    : 'https://api.music.yandex.ru';
}

async function readLikesFromPage(tabId: number, base: string): Promise<Track[] | null> {
  // Firefox exposes the scripting API as browser.scripting (promise-based)
  // and leaves chrome.scripting empty, while Chrome has the promise form on
  // chrome.scripting. Both resolve to the same call.
  const scripting =
    (
      globalThis as typeof globalThis & {
        browser?: { scripting?: ChromeExtensionApi['scripting'] };
      }
    ).browser?.scripting ?? getExtensionApi()?.scripting;
  if (!scripting?.executeScript) return null;
  try {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 30000);
    });
    const results = await Promise.race([
      scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: readLikesInPage,
        args: [base],
      }),
      timeout,
    ]);
    const payload = results?.[0]?.result;
    if (!payload?.tracks?.length) return null;
    return payload.tracks;
  } catch {
    return null;
  }
}

function dedupeTracks(tracks: Track[]): Track[] {
  const unique = new Map<string, Track>();
  for (const track of tracks) {
    const normalized = { ...track, id: track.id || stableTrackId(track) };
    unique.set(stableTrackId(normalized), normalized);
  }
  return [...unique.values()];
}

export async function collectFavorites(): Promise<Track[]> {
  const api = getExtensionApi();
  if (!api?.tabs?.query || !api.tabs.sendMessage) {
    throw new Error('Установите расширение и откройте Яндекс Музыку в браузере.');
  }

  const tabsApi = api.tabs;
  const allTabs = await callApi<ExtensionTab[]>((callback) => tabsApi.query({}, callback));
  const musicTabs = allTabs.filter(
    (item) => typeof item.id === 'number' && YANDEX_MUSIC_URL.test(item.url ?? ''),
  );
  if (!musicTabs.length) {
    throw new Error(
      'Откройте music.yandex.ru в любой вкладке (и войдите в аккаунт), затем повторите сбор.',
    );
  }

  const [activeTab] = await callApi<ExtensionTab[]>((callback) =>
    tabsApi.query({ active: true, currentWindow: true }, callback),
  );
  const tab = musicTabs.find((item) => item.id === activeTab?.id) ?? musicTabs[0];
  const tabId = tab?.id;
  if (typeof tabId !== 'number') {
    throw new Error('Не удалось определить вкладку Яндекс Музыки.');
  }

  const pageTracks = await readLikesFromPage(tabId, apiBaseForTab(tab?.url));
  if (pageTracks?.length) {
    return dedupeTracks(pageTracks);
  }

  let response: { ok?: boolean; tracks?: Track[]; error?: string } | undefined;
  try {
    response = (await Promise.race([
      callApi<unknown>((callback) =>
        tabsApi.sendMessage(tabId, { type: 'READ_YANDEX_FAVORITES' }, callback),
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                'Вкладка Яндекс Музыки не ответила вовремя. Перезагрузите её и повторите сбор.',
              ),
            ),
          80000,
        ),
      ),
    ])) as typeof response;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Перезагрузите страницу Яндекс Музыки и повторите сбор: расширение не смогло связаться с вкладкой.',
    );
  }

  if (!response?.ok) {
    throw new Error(
      response?.error ??
        'Не удалось прочитать список. Обновите страницу Яндекс Музыки и попробуйте снова.',
    );
  }
  if (!Array.isArray(response.tracks)) {
    throw new Error('Расширение не смогло прочитать список любимых треков.');
  }

  return dedupeTracks(response.tracks);
}

let lookupCancelled = false;

export function cancelLookup(): void {
  lookupCancelled = true;
}

export async function lookupLibraryGenres(
  tracks: Track[],
  onProgress?: (done: number, total: number) => void,
  onPartial?: (results: TrackResult[]) => void,
): Promise<TrackResult[]> {
  lookupCancelled = false;
  const existing = await loadStoredLibrary().catch(() => migrateLibrary(null));
  const byId = new Map(existing.results.map((result) => [stableTrackId(result.track), result]));
  const uniqueTracks = [...new Map(tracks.map((track) => [stableTrackId(track), track])).values()];

  // Phase 1 — instant map. Yandex ships one genre per album, so every track
  // already has a label and the cloud renders in a second instead of waiting
  // for the rate-limited catalogs.
  const seeded = uniqueTracks.map((track) => {
    const key = stableTrackId(track);
    const cached = byId.get(key);
    if (cached && (cached.genres.length > 0 || cached.checked)) {
      const refreshed = { ...cached, track };
      byId.set(key, refreshed);
      return refreshed;
    }
    const seed = seedTrackResult(track);
    byId.set(key, seed);
    return seed;
  });
  onPartial?.(seeded);
  await saveStoredLibrary(seeded.filter(Boolean));

  const pending = uniqueTracks.filter((track) => {
    const result = byId.get(stableTrackId(track));
    if (!result) return true;
    // Seeds are always refined; already matched catalog results are reused.
    if (result.checked === false) return true;
    return !result.checked && result.genres.length === 0;
  });
  let done = uniqueTracks.length - pending.length;
  onProgress?.(done, uniqueTracks.length);

  let processedSinceSave = 0;
  const snapshot = () => uniqueTracks.map((item) => byId.get(stableTrackId(item))!).filter(Boolean);
  for (const track of pending) {
    if (lookupCancelled) break;
    // A hard per-track cap keeps the UI honest: three retries on two
    // rate-limited services can otherwise stall a single track for minutes.
    const result = await Promise.race([
      lookupTrackGenres(track),
      new Promise<TrackResult>((resolve) =>
        setTimeout(() => resolve(seedTrackResult(track)), 45000),
      ),
    ]);
    byId.set(stableTrackId(track), result);
    done += 1;
    processedSinceSave += 1;
    onProgress?.(done, uniqueTracks.length);
    if (processedSinceSave >= 5 || done === uniqueTracks.length) {
      processedSinceSave = 0;
      const current = snapshot();
      await saveStoredLibrary(current);
      onPartial?.(current);
    }
  }

  const finalResults = snapshot();
  await saveStoredLibrary(finalResults);

  return finalResults;
}
