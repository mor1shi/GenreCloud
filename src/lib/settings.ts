import type { Language } from './i18n';
import { readLocal, writeLocal } from './storage';

export const SETTINGS_KEY = 'genrecloud-settings-v1';

export type { Language };
export type TopN = 20 | 50 | 80 | 'all';

export type Settings = {
  language: Language;
  topN: TopN;
  discogsToken: string;
  spotifyClientId: string;
  enableYandex: boolean;
  enableSpotify: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  topN: 80,
  discogsToken: '',
  spotifyClientId: '',
  enableYandex: true,
  enableSpotify: false,
};

function isTopN(value: unknown): value is TopN {
  return value === 20 || value === 50 || value === 80 || value === 'all';
}

export function normalizeSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS };
  const raw = value as Partial<Settings>;
  return {
    language: raw.language === 'ru' ? 'ru' : 'en',
    topN: isTopN(raw.topN) ? raw.topN : DEFAULT_SETTINGS.topN,
    discogsToken: typeof raw.discogsToken === 'string' ? raw.discogsToken.trim() : '',
    spotifyClientId: typeof raw.spotifyClientId === 'string' ? raw.spotifyClientId.trim() : '',
    enableYandex: raw.enableYandex !== false,
    enableSpotify: raw.enableSpotify === true,
  };
}

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await readLocal<unknown>(SETTINGS_KEY));
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeLocal(SETTINGS_KEY, settings);
}
