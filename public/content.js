(() => {
  // The web player talks to the music API through the same site cookies.
  // Reading the library through that API is far more reliable (and faster)
  // than scraping a virtualised list, so scraping is kept as a fallback.
  // The API host must match the site's domain: a .com session has no cookies
  // on api.music.yandex.ru, and a failed first candidate used to abort the
  // whole API path, silently falling back to the DOM scraper.
  const siteDomain = location.hostname.split('.').pop();
  const API_BASES =
    siteDomain === 'com'
      ? ['https://api.music.yandex.com']
      : ['https://api.music.yandex.ru', 'https://api.music.yandex.net'];
  const TRACK_ID_RE = /\/track\/(\d+)/;

  const ROW_SELECTORS = [
    '[class*="CommonTrack_root"]',
    '[data-test-id*="track"]',
    '[data-track-id]',
    '.d-track',
  ].join(',');

  const clean = (value) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s·•—-]+|[\s·•—-]+$/g, '')
      .trim();

  const normalize = (value) =>
    clean(value)
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase()
      .replace(/[’'`]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  class NoAuthError extends Error {}

  async function requestApi(base, path, init = {}) {
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), 20000)
      : null;
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        credentials: 'include',
        signal: controller?.signal,
        ...init,
        headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      });
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === 'AbortError'
          ? 'API Яндекс Музыки не ответил вовремя.'
          : 'Не удалось связаться с API Яндекс Музыки (сетевая ошибка или CORS).',
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (response.status === 401 || response.status === 403) {
      throw new NoAuthError(
        'Войдите в аккаунт Яндекс Музыки и повторите сбор.',
      );
    }
    if (!response.ok) {
      throw new Error(`API Яндекс Музыки ответил с кодом ${response.status}.`);
    }
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new NoAuthError(
        'API Яндекс Музыки вернул страницу входа вместо данных.',
      );
    }
    return payload && typeof payload === 'object' && 'result' in payload
      ? payload.result
      : payload;
  }

  const isFullTrack = (track) =>
    Boolean(
      track &&
        typeof track === 'object' &&
        clean(track.title) &&
        Array.isArray(track.artists) &&
        track.artists.length,
    );

  const toTrack = (track) => {
    const album = track.albums?.[0] ?? track.album;
    return {
      id: String(track.id ?? track.realId ?? ''),
      title: clean(track.title),
      artist: track.artists
        .map((artist) => clean(artist?.name ?? artist))
        .filter(Boolean)
        .join(', '),
      album: clean(album?.title ?? '') || undefined,
      // Yandex stores one coarse genre per album; it is enough to build the
      // map instantly while the slower catalog lookups are still running.
      yandexGenre: clean(album?.genre ?? '') || undefined,
    };
  };

  const addTrack = (found, track) => {
    if (!track?.title || !track.artist) return;
    const key = track.id
      ? `id:${track.id}`
      : `${normalize(track.artist)}::${normalize(track.title)}`;
    if (!found.has(key)) found.set(key, track);
  };

  // Runs in the page's own JavaScript world via an injected <script>. A
  // content-script fetch is rejected by the API (it sees an extension origin),
  // while the page's fetch carries the player's cookies and origin and answers
  // with the full library. The function is stringified, so it must stay
  // self-contained: no closures, only its arguments.
  async function pageCollectLikes(token, bases, chunkSize) {
    const post = (payload) => {
      try {
        window.postMessage({ __genreCloudToken: token, ...payload }, '*');
      } catch {
        /* the content script has already timed out */
      }
    };
    const text = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const read = async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let response;
      try {
        response = await fetch(url, {
          credentials: 'include',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
      } finally {
        clearTimeout(timer);
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('Войдите в аккаунт Яндекс Музыки и повторите сбор.');
      }
      if (!response.ok) {
        throw new Error(
          `API Яндекс Музыки ответил с кодом ${response.status}.`,
        );
      }
      return response.json();
    };
    try {
      let base = null;
      let status = null;
      let lastError = null;
      for (const candidate of bases) {
        try {
          status = await read(`${candidate}/account/status`);
          base = candidate;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!base) {
        throw lastError ?? new Error('Не удалось связаться с API.');
      }
      const uid = status?.account?.uid;
      if (!uid) {
        throw new Error('Войдите в аккаунт Яндекс Музыки и повторите сбор.');
      }
      const likes = await read(`${base}/users/${uid}/likes/tracks`);
      const items = likes?.library?.tracks ?? likes?.tracks;
      if (!Array.isArray(items)) {
        throw new Error('API вернул неожиданный формат списка.');
      }
      const tracks = [];
      const seen = new Set();
      const add = (track) => {
        const album = track.albums?.[0] ?? track.album;
        const artist = (track.artists ?? [])
          .map((entry) => text(entry?.name ?? entry))
          .filter(Boolean)
          .join(', ');
        const item = {
          id: String(track.id ?? ''),
          title: text(track.title),
          artist,
          album: text(album?.title) || undefined,
          yandexGenre: text(album?.genre) || undefined,
        };
        if (!item.title || !item.artist) return;
        const key = item.id || `${item.artist}::${item.title}`;
        if (seen.has(key)) return;
        seen.add(key);
        tracks.push(item);
      };
      const short = [];
      for (const item of items) {
        const embedded = item?.track ?? item;
        if (
          embedded &&
          Array.isArray(embedded.artists) &&
          embedded.artists.length
        ) {
          add(embedded);
        } else if (item && item.id !== undefined) {
          short.push(item);
        }
      }
      let failedBatches = 0;
      for (let index = 0; index < short.length; index += chunkSize) {
        const ids = short
          .slice(index, index + chunkSize)
          .map((item) => String(item.id))
          .join(',');
        const url = `${base}/tracks?track-ids=${encodeURIComponent(ids)}&with-positions=false`;
        let batch = null;
        try {
          batch = await read(url);
        } catch {
          // Yandex occasionally throttles a burst of batch requests; one short
          // retry keeps the full library instead of dropping to the DOM.
          await new Promise((resolve) => setTimeout(resolve, 400));
          try {
            batch = await read(url);
          } catch {
            failedBatches += 1;
          }
        }
        if (Array.isArray(batch)) batch.forEach(add);
        if (index + chunkSize < short.length) {
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      }
      if (!tracks.length) {
        throw new Error('Не удалось получить треки из API.');
      }
      post({ ok: true, tracks, failedBatches });
    } catch (error) {
      post({
        ok: false,
        error:
          error instanceof Error ? error.message : 'Не удалось прочитать список.',
      });
    }
  }

  const readFavoritesViaPage = () =>
    new Promise((resolve, reject) => {
      const token = `ygc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      let timer = null;
      const cleanup = () => {
        window.removeEventListener('message', onMessage);
        if (timer) clearTimeout(timer);
        script.remove();
      };
      const onMessage = (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.__genreCloudToken !== token) return;
        cleanup();
        if (data.ok) resolve(data.tracks);
        else reject(new Error(data.error || 'Не удалось прочитать список.'));
      };
      window.addEventListener('message', onMessage);
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Страница не ответила на запрос к API вовремя.'));
      }, 15000);
      script.textContent = `(${pageCollectLikes.toString()})(${JSON.stringify(
        token,
      )}, ${JSON.stringify(API_BASES)}, 50);`;
      (document.head || document.documentElement).appendChild(script);
    });

  async function readFavoritesViaApi() {
    let base = null;
    let status = null;
    let lastError = null;
    for (const candidate of API_BASES) {
      try {
        status = await requestApi(candidate, '/account/status');
        base = candidate;
        break;
      } catch (error) {
        lastError = error;
        if (error instanceof NoAuthError) throw error;
      }
    }
    if (!base || !status) {
      throw lastError ?? new Error('Не удалось связаться с API Яндекс Музыки.');
    }

    const uid = status?.account?.uid;
    if (!uid) {
      throw new NoAuthError(
        'Войдите в аккаунт Яндекс Музыки и повторите сбор.',
      );
    }

    const likes = await requestApi(
      base,
      `/users/${encodeURIComponent(uid)}/likes/tracks`,
    );
    const items =
      likes?.library?.tracks ??
      likes?.tracks ??
      (Array.isArray(likes) ? likes : null);
    if (!Array.isArray(items)) {
      throw new Error('API Яндекс Музыки вернул неожиданный формат списка.');
    }

    const found = new Map();
    const shortItems = [];
    for (const item of items) {
      const embedded = item?.track ?? item;
      if (isFullTrack(embedded)) addTrack(found, toTrack(embedded));
      else if (item && item.id !== undefined) shortItems.push(item);
    }

    // The API rejects large batches: track ids alone work up to ~99 per
    // request, while the "id:albumId" form fails above a dozen entries. The
    // old 100-id chunk used to make every call fail with HTTP 400, which
    // silently pushed the whole collection into the slow DOM scraper.
    const chunkSize = 50;
    for (let index = 0; index < shortItems.length; index += chunkSize) {
      const ids = shortItems
        .slice(index, index + chunkSize)
        .map((item) => String(item.id))
        .join(',');
      const query = `track-ids=${encodeURIComponent(ids)}&with-positions=false`;
      const tracks = await requestApi(base, `/tracks?${query}`);
      for (const track of Array.isArray(tracks) ? tracks : []) {
        if (isFullTrack(track)) addTrack(found, toTrack(track));
      }
    }

    return [...found.values()];
  }

  const extractTrack = (row) => {
    const titleLink = row.querySelector('a[href*="/track/"]');
    const title = clean(titleLink?.textContent);
    if (!title) return null;

    const href = titleLink.getAttribute('href') ?? '';
    const id = (href.match(TRACK_ID_RE) ?? [])[1] ?? '';

    const artist = [...row.querySelectorAll('a[href*="/artist/"]')]
      .map((node) => clean(node.textContent))
      .filter(Boolean)
      .join(', ');

    let resolvedArtist = artist;
    if (!resolvedArtist) {
      const label = clean(row.getAttribute('aria-label'));
      if (label.toLowerCase().endsWith(title.toLowerCase())) {
        resolvedArtist = clean(label.slice(0, label.length - title.length));
      }
    }
    if (!resolvedArtist) {
      const lines = clean(row.innerText ?? row.textContent)
        .split(/\n+/)
        .map(clean)
        .filter((text) => text && !/^\d{1,2}:\d{2}$/.test(text));
      resolvedArtist = lines.find((line) => line !== title) ?? '';
    }
    if (!resolvedArtist || resolvedArtist === title) return null;

    return {
      id: id || `${normalize(resolvedArtist)}::${normalize(title)}`,
      title,
      artist: resolvedArtist,
    };
  };

  const collectVisibleTracks = (found) => {
    for (const element of document.querySelectorAll(ROW_SELECTORS)) {
      if (!(element instanceof HTMLElement)) continue;
      // Avoid treating a list container as a track when it contains nested rows.
      if (element.querySelector(ROW_SELECTORS)) continue;
      const track = extractTrack(element);
      if (!track) continue;
      const key = `${normalize(track.artist)}::${normalize(track.title)}`;
      if (!found.has(key)) found.set(key, track);
    }
  };

  const isScrollable = (element) =>
    element instanceof HTMLElement &&
    element.clientHeight > 120 &&
    element.scrollHeight - element.clientHeight > 80 &&
    /(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY);

  const findScrollContainer = () => {
    const virtuoso = document.querySelector('[data-test-id="virtuoso-scroller"]');
    if (isScrollable(virtuoso)) return virtuoso;

    const seed = document.querySelector(ROW_SELECTORS);
    let ancestor = seed?.parentElement;
    while (ancestor && ancestor !== document.body) {
      if (isScrollable(ancestor)) return ancestor;
      ancestor = ancestor.parentElement;
    }
    return document.scrollingElement ?? document.documentElement;
  };

  const waitForRows = async (timeoutMs) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (document.querySelector(ROW_SELECTORS)) return true;
      await wait(150);
    }
    return false;
  };

  const scrollElementTo = (element, top) => {
    if (
      element === document.body ||
      element === document.documentElement ||
      element === document.scrollingElement
    ) {
      window.scrollTo(0, top);
    } else {
      element.scrollTop = top;
    }
  };

  const currentScrollTop = (element) =>
    element === document.body ||
    element === document.documentElement ||
    element === document.scrollingElement
      ? window.scrollY
      : element.scrollTop;

  const looksLikeFavorites = () => {
    const title = clean(document.title).toLocaleLowerCase();
    const pathname = location.pathname.toLocaleLowerCase();
    return (
      title.includes('мне нравится') ||
      title.includes('liked') ||
      /^\/users\/[^/]+\/tracks(?:\/|$)/.test(pathname) ||
      /\/playlists?\/3(?:\/|$)/.test(pathname) ||
      pathname.includes('my-favorites')
    );
  };

  const readFavoritesViaDom = async () => {
    if (!looksLikeFavorites()) {
      throw new Error(
        'Откройте страницу «Мне нравится» или войдите в аккаунт Яндекс Музыки.',
      );
    }
    if (!(await waitForRows(6000))) {
      throw new Error(
        'Список ещё не загрузился. Обновите страницу «Мне нравится» и повторите сбор.',
      );
    }

    const found = new Map();
    const container = findScrollContainer();
    const originalTop = currentScrollTop(container);

    collectVisibleTracks(found);
    let stagnantBottomPasses = 0;

    // The list is virtualised: only the rows near the viewport exist in the DOM.
    // Move in small steps, collect during the render pause, and stop only when
    // the end of the list has been reached with no new rows for a few passes.
    for (let pass = 0; pass < 2400 && found.size < 20000; pass += 1) {
      const viewport = Math.max(240, container.clientHeight || window.innerHeight);
      const bottom = Math.max(0, container.scrollHeight - viewport);
      const currentTop = currentScrollTop(container);

      if (currentTop >= bottom - 2) {
        // Near the end the list can still append another page: wait and re-check.
        const before = found.size;
        await wait(300);
        collectVisibleTracks(found);
        stagnantBottomPasses =
          found.size > before ? 0 : stagnantBottomPasses + 1;
        if (stagnantBottomPasses >= 4) break;
        continue;
      }

      stagnantBottomPasses = 0;
      const step = Math.max(220, Math.floor(viewport * 0.7));
      scrollElementTo(container, Math.min(bottom, currentTop + step));
      for (let tick = 0; tick < 4; tick += 1) {
        await wait(110);
        collectVisibleTracks(found);
      }
    }

    scrollElementTo(container, originalTop);
    await wait(150);
    collectVisibleTracks(found);
    if (!found.size) {
      throw new Error(
        'Не нашёл треки. Обновите страницу «Мне нравится» и дождитесь загрузки списка.',
      );
    }
    return [...found.values()];
  };

  let lastApiFailure = '';

  const readFavorites = async () => {
    // Page-world collection first: it uses the player's cookies and origin and
    // is the only path that works in Firefox. The content-script request is
    // kept for environments that allow it, DOM scraping is the last resort.
    let apiError = null;
    try {
      return await readFavoritesViaPage();
    } catch (error) {
      apiError = error;
    }
    try {
      return await readFavoritesViaApi();
    } catch (error) {
      apiError = error;
    }
    lastApiFailure =
      apiError instanceof Error ? apiError.message : String(apiError);
    try {
      console.warn(
        '[Жанрограф] Не удалось прочитать коллекцию через API, использую прокрутку страницы:',
        apiError,
      );
      return await readFavoritesViaDom();
    } catch (domError) {
      if (apiError instanceof NoAuthError) throw apiError;
      const reason =
        domError instanceof Error ? domError.message : String(domError);
      throw new Error(
        apiError instanceof Error
          ? `${apiError.message} ${reason}`
          : reason,
      );
    }
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'READ_YANDEX_FAVORITES') return false;
    readFavorites()
      .then((tracks) => sendResponse({ ok: true, tracks, apiError: lastApiFailure || undefined, version: 'v7' }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Не удалось прочитать список.',
        }),
      );
    return true;
  });
})();
