import type { Track } from '../music';
import { stableTrackId } from '../music';
import type { MusicSource } from './types';

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



export function createYandexSource(): MusicSource {
  return {
    id: 'yandex',
    label: 'Yandex Music',
    collectFavorites: collectFavorites,
  };
}
