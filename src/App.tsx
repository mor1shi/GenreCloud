import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownToLine,
  AudioLines,
  Check,
  CircleHelp,
  Disc3,
  Heart,
  LoaderCircle,
  LockKeyhole,
  RotateCw,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import type { GenreCloudCallbacks, Track, TrackResult } from './types';
import {
  cancelLookup,
  clearStoredLibrary,
  collectFavorites,
  exportLibraryJson,
  isExtensionRuntime,
  loadStoredLibrary,
  lookupLibraryGenres,
} from './lib/extension-runtime';
import { aggregateGenres, normalizeText } from './lib/music';
import './index.css';

const queryClient = new QueryClient();

type Props = Partial<GenreCloudCallbacks>;
type BusyState = 'idle' | 'collecting' | 'looking-up';

function tracksWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'трек';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'трека';
  return 'треков';
}

// Deterministic stagger so the cloud keeps its animation when live updates
// reorder words: changing animation-delay restarts a CSS animation, and an
// index-based delay would replay the whole cloud on every refinement tick.
function wordDelay(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return (hash % 9) * 22;
}

function Home({
  onCollect,
  onLookup,
  onRestore,
  onExport,
  onClear,
  onCancel,
}: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [results, setResults] = useState<TrackResult[]>([]);
  const [busy, setBusy] = useState<BusyState>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const inExtension = isExtensionRuntime();

  useEffect(() => {
    let cancelled = false;
    onRestore?.()
      .then((savedResults) => {
        if (cancelled || !savedResults.length) return;
        setResults(savedResults);
        setTracks(savedResults.map((result) => result.track));
        setProgress({ done: savedResults.length, total: savedResults.length });
      })
      .catch(() => {
        // A fresh browser profile has no local extension data yet.
      });
    return () => {
      cancelled = true;
    };
  }, [onRestore]);

  const counts = useMemo(() => {
    let musicBrainzTracks = 0;
    let discogsTracks = 0;
    let yandexTracks = 0;
    results.forEach((result) => {
      if (result.status !== 'matched') return;
      if (result.genres.some((genre) => genre.sources.includes('MusicBrainz'))) musicBrainzTracks += 1;
      if (result.genres.some((genre) => genre.sources.includes('Discogs'))) discogsTracks += 1;
      if (result.genres.some((genre) => genre.sources.includes('Yandex'))) yandexTracks += 1;
    });
    return {
      genreCounts: aggregateGenres(results),
      matched: results.filter((result) => result.status === 'matched').length,
      unmatched: results.filter((result) => result.status === 'unmatched').length,
      errors: results.filter((result) => result.status === 'error').length,
      catalogErrors: results.filter((result) => Object.keys(result.errors ?? {}).length > 0).length,
      musicBrainzTracks,
      discogsTracks,
      yandexTracks,
    };
  }, [results]);

  const startCollection = async () => {
    if (!onCollect || !onLookup || busy !== 'idle') {
      if (!onCollect || !onLookup) setError('Сбор станет доступен после подключения расширения к открытой странице Яндекс Музыки.');
      return;
    }
    setError('');
    setNotice('');
    setResults([]);
    setActiveGenre(null);
    setProgress({ done: 0, total: 0 });
    cancelledRef.current = false;
    setBusy('collecting');
    try {
      const collected = await onCollect();
      setTracks(collected);
      if (!collected.length) {
        setNotice('В «Мне нравится» пока нет треков или аккаунт не авторизован. Проверьте Яндекс Музыку и повторите.');
        setBusy('idle');
        return;
      }
      setProgress({ done: 0, total: collected.length });
      setBusy('looking-up');
      const found = await onLookup(
        collected,
        (done, total) => {
          setProgress({ done: Math.min(done, total), total });
        },
        (partial) => {
          // Yandex seeds arrive immediately, so the cloud is usable while the
          // rate-limited catalogs refine it track by track.
          if (!cancelledRef.current) setResults(partial);
        },
      );
      setResults(found);
      setProgress({ done: found.length, total: collected.length });
      setBusy('idle');
      if (cancelledRef.current) {
        cancelledRef.current = false;
        setNotice('Поиск остановлен. Уже найденные жанры сохранены — запустите сбор снова, чтобы продолжить.');
      } else if (found.some((result) => result.status !== 'matched')) {
        setNotice('Готово не для всех треков: часть релизов не нашлась или ответила с ошибкой. Остальные жанры уже в облаке.');
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Не удалось завершить сбор. Проверьте страницу и повторите попытку.';
      setError(message || 'Не удалось завершить сбор. Проверьте страницу и повторите попытку.');
      setBusy('idle');
    }
  };

  const stopLookup = () => {
    if (busy !== 'looking-up') return;
    cancelledRef.current = true;
    onCancel?.();
    setNotice('Останавливаем поиск после текущего трека…');
  };

  const clearAll = () => {
    if (busy !== 'idle') return;
    if (!window.confirm('Очистить сохранённые жанры и треки? Это действие нельзя отменить.')) return;
    setTracks([]);
    setResults([]);
    setActiveGenre(null);
    setProgress({ done: 0, total: 0 });
    setError('');
    setNotice('');
    onClear?.();
  };

  const isBusy = busy !== 'idle';
  const isPartial =
    results.length > 0 && results.some((result) => result.status !== 'matched');
  const isComplete = results.length > 0 && !isPartial;
  const collectionLabel = busy === 'collecting' ? 'Собираем лайки…' : busy === 'looking-up' ? 'Уточняем жанры…' : 'Собрать жанры';
  const cloudGenres = counts.genreCounts.slice(0, 80);
  const maxCount = Math.max(1, ...cloudGenres.map((item) => item.count));
  const resultById = useMemo(
    () => new Map(results.map((result) => [result.track.id, result])),
    [results],
  );
  const selectedGenre = activeGenre
    ? counts.genreCounts.find(
        (genre) => normalizeText(genre.name) === normalizeText(activeGenre),
      ) ?? null
    : null;
  const genreResults = useMemo(() => {
    if (!activeGenre) return [];
    const key = normalizeText(activeGenre);
    return results.filter((result) =>
      result.genres.some((genre) => normalizeText(genre.name) === key),
    );
  }, [results, activeGenre]);
  const listedTracks = activeGenre
    ? genreResults.map((result) => result.track)
    : tracks;
  const visibleTracks = listedTracks.slice(0, 300);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" data-testid="text-brand">
          <span className="brand-mark"><AudioLines size={19} strokeWidth={2.4} /></span>
          <span>GenreCloud</span>
        </div>
        <div className="top-note"><span className="top-note-dot" /> личная карта музыки</div>
        {!inExtension && (
          <a className="extension-download" href={`${import.meta.env.BASE_URL}genrecloud-chrome.zip`} download data-testid="link-download-extension">
            <ArrowDownToLine size={14} /> Скачать расширение
          </a>
        )}
      </header>

      <div className="content">
        <section className="hero" aria-labelledby="page-title">
          <div>
            <div className="eyebrow">ваша музыкальная полка</div>
            <h1 id="page-title">Вкус звучит<br />как <em>карта.</em></h1>
            <p className="hero-copy">Соберите жанры из любимых треков — не статистику прослушиваний, а маленький дневник того, что вам близко.</p>
          </div>
          <div className="hero-aside" aria-hidden="true">
            <div className="aside-line" />
            <div className="aside-copy">Один любимый трек — один голос за каждый найденный жанр. Без счётчиков воспроизведения и лишних следов.</div>
            <div className="aside-mark"><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
        </section>
        {!inExtension && (
          <section className="install-note" aria-label="Как запустить расширение">
            <strong>Как подключить</strong>
            <span>Chrome: режим разработчика → «Загрузить распакованное» → dist/public. Firefox: about:debugging → «Load Temporary Add-on» → dist/firefox/manifest.json. Затем перезагрузите страницу Яндекс Музыки.</span>
          </section>
        )}
        {busy === 'looking-up' && (
          <div className="progress-strip" role="status" data-testid="status-lookup-progress">
            <div className="progress-icon"><Sparkles size={17} /></div>
            <div className="progress-copy">
              <div className="progress-top"><span>Облако уже собрано по жанрам Яндекс Музыки — уточняем каждый трек в каталогах</span><span>{progress.done} / {progress.total}</span></div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${progress.total ? Math.round(progress.done / progress.total * 100) : 0}%` }} /></div>
            </div>
          </div>
        )}
        {error && <div className="notice error" role="alert" data-testid="status-error"><AlertCircle size={16} /> <span>{error}</span></div>}
        {notice && (
          <div className={`notice ${isPartial ? 'partial' : 'success'}`} role="status" data-testid={isPartial ? 'status-partial' : 'status-notice'}>
            {isPartial ? <CircleHelp size={16} /> : <Check size={16} />} <span>{notice}</span>
          </div>
        )}

        <section className="workspace" aria-label="Облако жанров и управление">
          <div className="cloud-panel">
            <div className="panel-heading">
              <div>
                <h2 className="panel-title">Облако ваших жанров</h2>
                <div className="panel-kicker">частота = число разных любимых треков{counts.genreCounts.length > cloudGenres.length ? ' · топ-80' : ''}{counts.genreCounts.length ? ' · нажмите на слово' : ''}</div>
              </div>
              <div className="cloud-status" data-testid="status-cloud">
                <span className="status-orb" style={isComplete ? { background: '#3c8c74' } : isPartial ? { background: '#d7a648' } : undefined} />
                {busy === 'collecting' ? 'сбор' : busy === 'looking-up' ? 'уточняем' : isComplete ? 'готово' : isPartial ? 'частично' : 'ожидание'}
              </div>
            </div>
            <div className="cloud-inner">
              {counts.genreCounts.length ? (
                <div className="cloud-stack">
                  <div
                    className={`cloud-words ${activeGenre ? 'has-selection' : ''}`}
                    aria-label="Найденные жанры — нажмите, чтобы отфильтровать треки"
                  >
                    {cloudGenres.map((genre, index) => {
                      const fontSize = 17 + Math.round((genre.count / maxCount) * 31);
                      const isActive =
                        activeGenre !== null &&
                        normalizeText(genre.name) === normalizeText(activeGenre);
                      return (
                        <button
                          type="button"
                          key={genre.name}
                          className={`cloud-word word-${index % 5} ${isActive ? 'selected' : ''}`}
                          style={{
                            fontSize,
                            animationDelay: `${wordDelay(genre.name)}ms`,
                          }}
                          onClick={() =>
                            setActiveGenre(isActive ? null : genre.name)
                          }
                          aria-pressed={isActive}
                          data-count={genre.count}
                          title={`${genre.name}: ${genre.count} ${tracksWord(genre.count)}`}
                          data-testid={`genre-${genre.name.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-')}`}
                        >
                          {genre.name}
                        </button>
                      );
                    })}
                  </div>
                  {selectedGenre && (
                    <div className="cloud-detail" data-testid="cloud-detail">
                      <div className="cloud-detail-head">
                        <strong className="cloud-detail-name">{selectedGenre.name}</strong>
                        <span className="cloud-detail-count">
                          {selectedGenre.count} {tracksWord(selectedGenre.count)}
                        </span>
                        <span className="cloud-detail-sources">
                          {selectedGenre.sources.map((source) => (
                            <i
                              key={source}
                              className={`detail-source ${source === 'Discogs' ? 'source-discogs' : 'source-mb'}`}
                            >
                              {source}
                            </i>
                          ))}
                        </span>
                        <button
                          type="button"
                          className="detail-close"
                          onClick={() => setActiveGenre(null)}
                          aria-label="Сбросить фильтр"
                          data-testid="button-close-genre"
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div className="cloud-detail-tracks">
                        {genreResults.slice(0, 10).map((result) => (
                          <span className="cloud-detail-track" key={result.track.id}>
                            <b>{result.track.title}</b> · {result.track.artist}
                          </span>
                        ))}
                        {genreResults.length > 10 && (
                          <span className="cloud-detail-more">
                            и ещё {genreResults.length - 10}
                          </span>
                        )}
                        {!genreResults.length && (
                          <span className="cloud-detail-more">треки не найдены</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-cloud">
                  <div className="empty-illustration"><Disc3 size={30} strokeWidth={1.6} /></div>
                  <h3>{busy === 'looking-up' ? 'Собираем картину' : busy === 'collecting' ? 'Заглядываем в вашу полку' : results.length ? 'Жанры не найдены' : 'Здесь начнётся ваша карта'}</h3>
                  <p>{busy === 'looking-up' ? 'Облако уже строится по жанрам альбомов Яндекс Музыки, а каталоги уточняют стили по одному треку.' : busy === 'collecting' ? 'Читаем список любимых треков в открытой вкладке.' : results.length ? 'Треки собраны, но ни альбом, ни каталоги не вернули жанров. Проверьте ошибки или повторите поиск.' : 'Откройте music.yandex.ru в соседней вкладке и войдите в аккаунт — жанры появятся здесь.'}</p>
                </div>
              )}
            </div>
          </div>

          <aside className="side-panel">
            <h2 className="side-title">Ваша коллекция</h2>
            <button className="primary-btn" onClick={startCollection} disabled={isBusy} data-testid="button-collect">
              {isBusy ? <LoaderCircle className="spinner" size={16} /> : <Heart size={16} />}
              {collectionLabel}
            </button>
            {busy === 'looking-up' && (
              <button className="secondary-btn" onClick={stopLookup} data-testid="button-cancel">
                <Square size={14} /> Остановить поиск
              </button>
            )}
            <button className="secondary-btn" onClick={() => onExport?.()} disabled={!results.length || !onExport || isBusy} data-testid="button-export">
              <ArrowDownToLine size={15} /> Выгрузить результат
            </button>
            <div className="btn-row">
              <button className="secondary-btn" onClick={startCollection} disabled={isBusy || !tracks.length} data-testid="button-refresh">
                <RotateCw size={14} /> Обновить
              </button>
              <button className="secondary-btn" onClick={clearAll} disabled={isBusy || (!tracks.length && !results.length)} data-testid="button-clear">
                <Trash2 size={14} /> Очистить
              </button>
            </div>
            <hr className="side-divider" />
            <div className="stat-row"><span className="stat-label">Любимых треков</span><strong className="stat-value" data-testid="text-track-total">{tracks.length}</strong></div>
            <div className="stat-row"><span className="stat-label">Жанров на карте</span><strong className="stat-value" data-testid="text-genre-total">{counts.genreCounts.length}</strong></div>
            <div className="stat-row"><span className="stat-label">Нашлись жанры</span><strong className="stat-value" data-testid="text-matched">{counts.matched}<small> / {results.length || tracks.length}</small></strong></div>
            <div className="stat-row"><span className="stat-label">Без совпадения</span><strong className="stat-value" data-testid="text-unmatched">{counts.unmatched}<small> трек.</small></strong></div>
            <div className="stat-row"><span className="stat-label">Сбой каталога</span><strong className="stat-value" data-testid="text-catalog-errors">{counts.catalogErrors}<small> трек.</small></strong></div>
            <div className="source-coverage" aria-label="Покрытие источников">
              <div className="source-item"><span className="source-name"><span className="source-icon">Я</span>Яндекс Музыка</span><span className="source-count" data-testid="text-yandex-count">{counts.yandexTracks} трек.</span></div>
              <div className="source-item"><span className="source-name"><span className="source-icon">MB</span>MusicBrainz</span><span className="source-count" data-testid="text-musicbrainz-count">{counts.musicBrainzTracks} трек.</span></div>
              <div className="source-item"><span className="source-name"><span className="source-icon">D</span>Discogs</span><span className="source-count" data-testid="text-discogs-count">{counts.discogsTracks} трек.</span></div>
            </div>
            <div className="privacy-note"><LockKeyhole size={13} /> Жанры берутся из яндекс-альбомов мгновенно, затем уточняются в MusicBrainz и Discogs. Список хранится в браузере, прослушивания не отслеживаются.</div>
          </aside>
        </section>

        <section className="track-section" aria-labelledby="track-heading">
          <div className="section-head">
            <h2 id="track-heading">
              {activeGenre ? `Жанр: ${selectedGenre?.name ?? activeGenre}` : 'Треки на карте'}
            </h2>
            <div className="section-head-meta">
              {activeGenre ? (
                <button
                  type="button"
                  className="filter-chip"
                  onClick={() => setActiveGenre(null)}
                  data-testid="button-clear-filter"
                >
                  {listedTracks.length > visibleTracks.length
                    ? `первые ${visibleTracks.length} из ${listedTracks.length}`
                    : `${listedTracks.length} ${tracksWord(listedTracks.length)}`}{' '}
                  <X size={11} />
                </button>
              ) : (
                <span>
                  {tracks.length
                    ? tracks.length > visibleTracks.length
                      ? `первые ${visibleTracks.length} из ${tracks.length}`
                      : `${tracks.length} в коллекции`
                    : 'пока пусто'}
                </span>
              )}
            </div>
          </div>
          {tracks.length ? (
            <div className="track-list">
              {visibleTracks.map((track, index) => {
                const result = resultById.get(track.id);
                return (
                  <div className="track-row" key={track.id} data-testid={`row-track-${track.id}`} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
                    <span className="track-index">{String(index + 1).padStart(2, '0')}</span>
                    <div><div className="track-name">{track.title}</div><div className="track-artist">{track.artist}{track.album ? ` · ${track.album}` : ''}</div></div>
                    <div className="track-tags">
                      {result?.status === 'matched' && result.genres.length ? result.genres.slice(0, 3).map((genre) => <span className="track-tag" key={genre.name}>{genre.name}</span>) : null}
                      {result?.status === 'unmatched' && <span className="track-tag no-match">жанры не найдены</span>}
                      {result?.status === 'error' && (
                        <span
                          className="track-tag error"
                          title={
                            Object.entries(result.errors ?? {})
                              .map(([source, message]) => `${source}: ${message}`)
                              .join(' · ') || undefined
                          }
                        >
                          ошибка поиска
                        </span>
                      )}
                      {!result && busy === 'looking-up' && <span className="track-tag no-match">в очереди</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-table" data-testid="text-track-empty">После сбора здесь появится список треков и их найденные жанры.</div>
          )}
        </section>
      </div>
      <footer className="footer-note"><span>GenreCloud · заметки о любимом</span><span>Яндекс Музыка + MusicBrainz + Discogs</span></footer>
    </main>
  );
}

function Router({ callbacks }: { callbacks: Props }) {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/"><Home {...callbacks} /></Route>
        <Route path="/index.html"><Home {...callbacks} /></Route>
        <Route path="/popup.html"><Home {...callbacks} /></Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App(props: Props) {
  const callbacks: Props = {
    onCollect: props.onCollect ?? collectFavorites,
    onLookup: props.onLookup ?? lookupLibraryGenres,
    onRestore:
      props.onRestore ??
      (async () => {
        const saved = await loadStoredLibrary();
        return saved.results;
      }),
    onExport:
      props.onExport ??
      (() => {
        void loadStoredLibrary().then((saved) => exportLibraryJson(saved.results));
      }),
    onClear: props.onClear ?? clearStoredLibrary,
    onCancel: props.onCancel ?? cancelLookup,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className={isExtensionRuntime() ? 'extension-popup' : ''}>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router callbacks={callbacks} />
          </WouterRouter>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
