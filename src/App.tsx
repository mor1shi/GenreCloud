import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Download,
  LoaderCircle,
  Play,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { Cloud } from '@/components/Cloud';
import { TrackTable } from '@/components/TrackTable';
import { SettingsPanel } from '@/components/SettingsPanel';
import {
  buildCloudSvg,
  buildExportJson,
  downloadJson,
  downloadPng,
  downloadSvg,
} from '@/lib/export';
import { buildCloudWords, type CloudTheme } from '@/lib/cloud';
import { buildDemoResults } from '@/lib/demo';
import { cancelLookup, collectFavorites, lookupLibraryGenres } from '@/lib/extension-runtime';
import { translate, type MessageKey } from '@/lib/i18n';
import { aggregateGenres, type CatalogSource, type TrackResult } from '@/lib/music';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/lib/settings';
import { clearLibrary, isExtensionRuntime, loadLibrary, saveLibrary } from '@/lib/storage';
import { APP_VERSION } from '@/lib/version';

type Phase = 'idle' | 'collecting' | 'refining';
type Progress = { done: number; total: number };

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return dark;
}

function sourceCounts(results: TrackResult[]): Record<CatalogSource, number> {
  const counts: Record<CatalogSource, number> = {
    Yandex: 0,
    MusicBrainz: 0,
    Discogs: 0,
    Spotify: 0,
  };
  for (const result of results) {
    const seen = new Set<CatalogSource>();
    for (const hit of result.genres) {
      for (const source of hit.sources) seen.add(source);
    }
    for (const source of seen) counts[source] += 1;
  }
  return counts;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [results, setResults] = useState<TrackResult[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const dark = usePrefersDark();
  const theme: CloudTheme = dark ? 'dark' : 'light';
  const language = settings.language;
  const t = useCallback(
    (key: MessageKey, values?: Record<string, string | number>) => translate(language, key, values),
    [language],
  );

  useEffect(() => {
    let alive = true;
    void Promise.all([loadSettings(), loadLibrary()]).then(([storedSettings, library]) => {
      if (!alive) return;
      setSettings(storedSettings);
      setResults(library.results);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const counts = useMemo(() => aggregateGenres(results), [results]);
  const limit = settings.topN === 'all' ? Number.POSITIVE_INFINITY : settings.topN;
  const words = useMemo(() => buildCloudWords(counts, { limit, theme }), [counts, limit, theme]);
  const sources = useMemo(() => sourceCounts(results), [results]);
  const matched = results.filter((result) => result.status === 'matched').length;
  const unmatched = results.filter((result) => result.status === 'unmatched').length;
  const catalogErrors = results.filter((result) => result.status === 'error').length;
  const busy = phase !== 'idle';

  const patchSettings = (patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveSettings(next);
      return next;
    });
  };

  const runLookup = async (tracks: TrackResult['track'][]) => {
    setError('');
    setPhase('refining');
    try {
      const refined = await lookupLibraryGenres(
        tracks,
        (done, total) => setProgress({ done, total }),
        (partial) => setResults(partial),
      );
      setResults(refined);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : t('errors.collectFailed'));
    } finally {
      setPhase('idle');
    }
  };

  const collect = async () => {
    if (!isExtensionRuntime()) {
      setError(t('errors.noTab'));
      return;
    }
    setDemo(false);
    setError('');
    setPhase('collecting');
    setProgress({ done: 0, total: 0 });
    try {
      const tracks = await collectFavorites();
      const seeded = tracks.map((track) => ({
        track,
        genres: [],
        status: 'unmatched' as const,
        checked: false,
      }));
      setResults(seeded);
      await saveLibrary(seeded);
      await runLookup(tracks);
    } catch (collectError) {
      setError(collectError instanceof Error ? collectError.message : t('errors.collectFailed'));
      setPhase('idle');
    }
  };

  const refresh = () => {
    if (!results.length) return;
    void runLookup(results.map((result) => result.track));
  };

  const stop = () => {
    cancelLookup();
  };

  const showDemo = () => {
    setDemo(true);
    setSelectedGenre(null);
    setError('');
    setResults(buildDemoResults());
  };

  const exitDemo = async () => {
    setDemo(false);
    setSelectedGenre(null);
    const library = await loadLibrary();
    setResults(library.results);
  };

  const clearAll = async () => {
    if (!window.confirm(t('confirm.clear'))) return;
    await clearLibrary();
    setResults([]);
    setDemo(false);
    setSelectedGenre(null);
    setProgress({ done: 0, total: 0 });
  };

  const exportJson = () => {
    downloadJson(buildExportJson({ version: APP_VERSION, results, counts }));
  };

  const cloudSvg = () =>
    buildCloudSvg(counts, {
      theme,
      limit: settings.topN === 'all' ? 80 : settings.topN,
      subtitle: t('cloud.legend'),
    });

  const exportSvg = () => downloadSvg(cloudSvg());

  const exportPng = async () => {
    try {
      await downloadPng(cloudSvg());
    } catch (pngError) {
      setError(pngError instanceof Error ? pngError.message : t('errors.collectFailed'));
    }
  };

  const copyDiagnostics = async () => {
    const diagnostics = {
      app: 'GenreCloud',
      version: APP_VERSION,
      phase,
      demo,
      language,
      tracks: { total: results.length, matched, unmatched, errors: catalogErrors },
      genres: counts.length,
      sources,
      lastError: error || null,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setCopied(true);
    } catch {
      setError(t('errors.collectFailed'));
    }
  };

  const progressPercent =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const listed = selectedGenre
    ? results.filter((result) => result.genres.some((hit) => hit.name === selectedGenre))
    : results;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          GenreCloud <span className="version">v{APP_VERSION}</span>
        </div>
        <div className="topbar-spacer" />
        <button type="button" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={15} aria-hidden="true" />
          {t('nav.settings')}
        </button>
      </header>

      <main>
        <div className="page-head">
          <div>
            <h1>{t('page.title')}</h1>
            <p className="page-subtitle">{t('page.subtitle')}</p>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="primary"
              onClick={() => void collect()}
              disabled={busy}
            >
              {phase === 'collecting' ? (
                <LoaderCircle size={15} className="spin" aria-hidden="true" />
              ) : (
                <Play size={15} aria-hidden="true" />
              )}
              {phase === 'collecting' ? t('actions.collecting') : t('actions.collect')}
            </button>
            <button
              type="button"
              onClick={() => (demo ? void exitDemo() : showDemo())}
              disabled={phase === 'collecting'}
            >
              {demo ? t('nav.exitDemo') : t('nav.demo')}
            </button>
          </div>
        </div>

        {demo && <div className="notice">{t('demo.notice')}</div>}

        {error && (
          <div className="notice is-error" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span className="notice-text">{error}</span>
            <button type="button" onClick={() => void copyDiagnostics()}>
              <Copy size={14} aria-hidden="true" />
              {copied ? t('diagnostics.copied') : t('diagnostics.copy')}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setError('')}
              aria-label={t('settings.close')}
            >
              <X size={15} />
            </button>
          </div>
        )}

        <div className="layout">
          <section className="panel cloud-panel" aria-labelledby="cloud-heading">
            <div className="panel-head">
              <h2 id="cloud-heading">{t('cloud.title')}</h2>
              <span className="panel-note">
                {counts.length > words.length
                  ? t('cloud.topN', { shown: words.length, total: counts.length })
                  : null}
              </span>
            </div>

            {selectedGenre && (
              <div className="selection-bar">
                <span>
                  {t('cloud.selected', {
                    name: selectedGenre,
                    count: counts.find((item) => item.name === selectedGenre)?.count ?? 0,
                  })}
                </span>
                <button type="button" onClick={() => setSelectedGenre(null)}>
                  <X size={13} aria-hidden="true" />
                  {t('cloud.clear')}
                </button>
              </div>
            )}

            <Cloud
              words={words}
              language={language}
              selected={selectedGenre}
              onSelect={setSelectedGenre}
              emptyText={t('cloud.empty')}
              ariaLabel={t('cloud.title')}
            />
            <p className="legend">{t('cloud.legend')}</p>
          </section>

          <aside className="panel side-panel" aria-labelledby="collection-heading">
            <div className="panel-head">
              <h2 id="collection-heading">{t('collection.title')}</h2>
            </div>
            <div className="side-body">
              {busy && (
                <div className="progress-block">
                  <div className="progress-label">
                    {phase === 'collecting'
                      ? t('progress.building')
                      : t('progress.tracks', {
                          done: progress.done,
                          total: progress.total,
                        })}
                  </div>
                  <div
                    className="bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={progress.total || 100}
                    aria-valuenow={progress.total ? progress.done : undefined}
                  >
                    <span style={{ width: `${progress.total ? progressPercent : 100}%` }} />
                  </div>
                  {phase === 'refining' && (
                    <button type="button" onClick={stop}>
                      {t('actions.stop')}
                    </button>
                  )}
                </div>
              )}

              <div className="button-stack">
                <button type="button" onClick={refresh} disabled={busy || !results.length}>
                  <RefreshCw size={15} aria-hidden="true" />
                  {t('actions.refresh')}
                </button>

                <div className="export-block">
                  <span className="field-label">
                    <Download size={14} aria-hidden="true" />
                    {t('actions.export')}
                  </span>
                  <div className="segmented">
                    <button type="button" onClick={exportJson} disabled={!results.length}>
                      {t('export.json')}
                    </button>
                    <button type="button" onClick={exportSvg} disabled={!results.length}>
                      {t('export.svg')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportPng()}
                      disabled={!results.length}
                    >
                      {t('export.png')}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="danger"
                  onClick={() => void clearAll()}
                  disabled={busy || (!results.length && !demo)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  {t('actions.clear')}
                </button>
              </div>

              <dl className="stats">
                <div>
                  <dt>{t('stats.tracks')}</dt>
                  <dd>{results.length}</dd>
                </div>
                <div>
                  <dt>{t('stats.genres')}</dt>
                  <dd>{counts.length}</dd>
                </div>
                <div>
                  <dt>{t('stats.matched')}</dt>
                  <dd>
                    {matched}
                    <span className="stat-aux"> / {results.length || 0}</span>
                  </dd>
                </div>
                <div>
                  <dt>{t('stats.unmatched')}</dt>
                  <dd>{unmatched}</dd>
                </div>
                <div>
                  <dt>{t('stats.errors')}</dt>
                  <dd>{catalogErrors}</dd>
                </div>
              </dl>

              <div className="source-list">
                <span className="field-label">{t('stats.sources')}</span>
                {(['Yandex', 'MusicBrainz', 'Discogs', 'Spotify'] as CatalogSource[]).map(
                  (source) =>
                    sources[source] > 0 && (
                      <div key={source} className="source-row">
                        <span>{source}</span>
                        <span className="mono">{sources[source]}</span>
                      </div>
                    ),
                )}
                {Object.values(sources).every((value) => value === 0) && (
                  <span className="hint">{t('stats.none')}</span>
                )}
              </div>
            </div>
          </aside>
        </div>

        <section className="panel tracks-panel" aria-labelledby="tracks-heading">
          <div className="panel-head">
            <h2 id="tracks-heading">
              {selectedGenre ? t('tracks.filtered', { name: selectedGenre }) : t('tracks.title')}
            </h2>
            <span className="panel-note">
              {results.length
                ? listed.length > 300
                  ? t('tracks.showing', { shown: 300, total: listed.length })
                  : t('tracks.count', { count: listed.length })
                : null}
            </span>
          </div>
          {results.length ? (
            <TrackTable
              results={results}
              language={language}
              genre={selectedGenre}
              onSelectGenre={setSelectedGenre}
            />
          ) : (
            <div className="empty-state">
              <h3>{t('empty.title')}</h3>
              <p>{t('empty.body')}</p>
              <div className="page-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => void collect()}
                  disabled={busy}
                >
                  {t('actions.collect')}
                </button>
                <button type="button" onClick={showDemo}>
                  {t('nav.demo')}
                </button>
              </div>
              <p className="hint">{t('empty.demo')}</p>
            </div>
          )}
        </section>

        <p className="diagnostics-hint">{t('diagnostics.hint')}</p>
      </main>

      <footer className="footer">
        <span>GenreCloud {APP_VERSION}</span>
        <span>{t('footer.note')}</span>
      </footer>

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onPatch={patchSettings}
      />
    </div>
  );
}
