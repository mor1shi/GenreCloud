import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { translate, type MessageKey } from '@/lib/i18n';
import type { Settings } from '@/lib/settings';

type Props = {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onPatch: (patch: Partial<Settings>) => void;
  redirectUrl?: string;
  spotify?: {
    connected: boolean;
    busy: boolean;
    error?: string;
    onConnect: () => void;
    onDisconnect: () => void;
  };
};

export function SettingsPanel({ open, settings, onClose, onPatch, redirectUrl, spotify }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const language = settings.language;
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translate(language, key, values);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-head">
          <h2 id="settings-title">{t('settings.title')}</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('settings.close')}
            ref={closeRef}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <section className="field">
            <label htmlFor="settings-language">{t('settings.language')}</label>
            <select
              id="settings-language"
              value={settings.language}
              onChange={(event) => onPatch({ language: event.target.value === 'ru' ? 'ru' : 'en' })}
            >
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </section>

          <section className="field">
            <label htmlFor="settings-topn">{t('settings.topN')}</label>
            <select
              id="settings-topn"
              value={String(settings.topN)}
              onChange={(event) =>
                onPatch({
                  topN:
                    event.target.value === 'all'
                      ? 'all'
                      : (Number(event.target.value) as Settings['topN']),
                })
              }
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="80">80</option>
              <option value="all">{t('settings.topNAll')}</option>
            </select>
          </section>

          <section className="field">
            <h3>{t('settings.sources')}</h3>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.enableYandex}
                onChange={(event) => onPatch({ enableYandex: event.target.checked })}
              />
              {t('source.yandex')}
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.enableSpotify}
                onChange={(event) => onPatch({ enableSpotify: event.target.checked })}
              />
              {t('source.spotify')}
            </label>
            <p className="hint">{t('settings.sources.hint')}</p>
          </section>

          <section className="field">
            <h3>{t('settings.discogs.title')}</h3>
            <p className="hint">{t('settings.discogs.body')}</p>
            <label htmlFor="settings-discogs-token">{t('settings.discogs.token')}</label>
            <input
              id="settings-discogs-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={settings.discogsToken}
              onChange={(event) => onPatch({ discogsToken: event.target.value })}
            />
            <p className="hint">{t('settings.discogs.hint')}</p>
          </section>

          <section className="field">
            <h3>{t('settings.spotify.title')}</h3>
            <p className="hint">{t('settings.spotify.body', { redirect: redirectUrl ?? '—' })}</p>
            {redirectUrl && <code className="code-block">{redirectUrl}</code>}
            <label htmlFor="settings-spotify-client">{t('settings.spotify.clientId')}</label>
            <input
              id="settings-spotify-client"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={settings.spotifyClientId}
              onChange={(event) => onPatch({ spotifyClientId: event.target.value })}
            />
            <div className="inline-row">
              <span className="status-text">
                {spotify?.connected
                  ? t('settings.spotify.connected')
                  : t('settings.spotify.notConnected')}
              </span>
              {spotify?.connected ? (
                <button type="button" onClick={spotify.onDisconnect} disabled={spotify.busy}>
                  {t('settings.spotify.disconnect')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={spotify?.onConnect}
                  disabled={!spotify || spotify.busy || !settings.spotifyClientId.trim()}
                >
                  {t('settings.spotify.connect')}
                </button>
              )}
            </div>
            {spotify?.error && <p className="hint is-danger">{spotify.error}</p>}
            <p className="hint">{t('settings.spotify.experimental')}</p>
          </section>

          <p className="hint">{t('settings.saved')}</p>
        </div>
      </div>
    </div>
  );
}
