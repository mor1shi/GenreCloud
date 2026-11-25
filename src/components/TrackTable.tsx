import { ExternalLink } from 'lucide-react';
import type { TrackResult } from '@/lib/music';
import { normalizeText } from '@/lib/music';
import { translate, type Language, type MessageKey } from '@/lib/i18n';

type Props = {
  results: TrackResult[];
  language: Language;
  genre: string | null;
  onSelectGenre: (name: string | null) => void;
  limit?: number;
};

export function TrackTable({ results, language, genre, onSelectGenre, limit = 300 }: Props) {
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translate(language, key, values);

  const filtered = genre
    ? results.filter((result) =>
        result.genres.some((hit) => normalizeText(hit.name) === normalizeText(genre)),
      )
    : results;
  const visible = filtered.slice(0, limit);

  if (!visible.length) {
    return <p className="empty-inline">{t('tracks.empty')}</p>;
  }

  return (
    <div className="track-list">
      {visible.map((result, index) => (
        <div className="track-row" key={`${result.track.id}-${index}`}>
          <span className="track-index">{String(index + 1).padStart(2, '0')}</span>
          <div className="track-main">
            <div className="track-title">
              {result.track.spotifyUrl ? (
                <a
                  href={result.track.spotifyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={t('tracks.openSpotify')}
                >
                  {result.track.title}
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              ) : (
                result.track.title
              )}
            </div>
            <div className="track-meta">
              {result.track.artist}
              {result.track.album ? ` · ${result.track.album}` : ''}
            </div>
          </div>
          <div className="track-tags">
            {result.status === 'matched' &&
              result.genres.slice(0, 3).map((hit) => (
                <button
                  type="button"
                  className="tag"
                  key={hit.name}
                  title={hit.sources.join(', ')}
                  onClick={() => onSelectGenre(hit.name)}
                >
                  {hit.name}
                </button>
              ))}
            {result.status === 'unmatched' && (
              <span className="tag is-muted">{t('tracks.noGenres')}</span>
            )}
            {result.status === 'error' && (
              <span className="tag is-danger" title={Object.values(result.errors ?? {}).join(' ')}>
                {t('stats.errors')}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
