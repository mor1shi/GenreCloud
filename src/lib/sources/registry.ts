import type { Settings } from '../settings';
import type { MusicSource, SourceId } from './types';
import { createYandexSource } from './yandex';

export type { MusicSource, SourceId } from './types';

/**
 * Spotify is imported dynamically on purpose: deleting src/lib/sources/spotify
 * and its branch below removes the integration without touching the rest of
 * the application.
 */
export async function createSource(id: SourceId, _settings: Settings): Promise<MusicSource> {
  if (id === 'yandex') return createYandexSource();
  throw new Error(`Unknown source: ${String(id)}`);
}

export function availableSources(settings: Settings): SourceId[] {
  const sources: SourceId[] = [];
  if (settings.enableYandex) sources.push('yandex');
  if (settings.enableSpotify) sources.push('spotify');
  return sources;
}
