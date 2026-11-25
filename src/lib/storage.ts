import type { TrackResult } from './music';
import {
  LIBRARY_KEY,
  LIBRARY_SCHEMA_VERSION,
  migrateLibrary,
  type StoredLibrary,
} from './storage-migration';

type StorageArea = {
  get: (keys: string | string[], callback: (values: Record<string, unknown>) => void) => void;
  set: (values: Record<string, unknown>, callback: () => void) => void;
  remove: (keys: string | string[], callback: () => void) => void;
};

type ChromeApi = {
  runtime?: { id?: string; lastError?: { message?: string } };
  storage?: { local?: StorageArea };
};

function chromeApi(): ChromeApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
}

export function isExtensionRuntime(): boolean {
  return Boolean(chromeApi()?.runtime?.id && chromeApi()?.storage?.local);
}

function area(): StorageArea | undefined {
  return chromeApi()?.storage?.local;
}

function call<T>(fn: (done: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      fn((value) => {
        const error = chromeApi()?.runtime?.lastError;
        if (error) reject(new Error(error.message ?? 'Storage error.'));
        else resolve(value);
      });
    } catch (error) {
      reject(error);
    }
  });
}

const fallbackPrefix = 'genrecloud:';

function readFallback(key: string): unknown {
  if (typeof localStorage === 'undefined') return undefined;
  const raw = localStorage.getItem(fallbackPrefix + key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function readLocal<T>(key: string): Promise<T | undefined> {
  const storage = area();
  if (!storage) return readFallback(key) as T | undefined;
  const values = await call<Record<string, unknown>>((done) => storage.get(key, done));
  return values[key] as T | undefined;
}

export async function writeLocal(key: string, value: unknown): Promise<void> {
  const storage = area();
  if (!storage) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(fallbackPrefix + key, JSON.stringify(value));
    }
    return;
  }
  await call<void>((done) => storage.set({ [key]: value }, done));
}

export async function removeLocal(keys: string | string[]): Promise<void> {
  const storage = area();
  if (!storage) {
    if (typeof localStorage !== 'undefined') {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        localStorage.removeItem(fallbackPrefix + key);
      }
    }
    return;
  }
  await call<void>((done) => storage.remove(keys, done));
}

export async function loadLibrary(): Promise<StoredLibrary> {
  const value = await readLocal<unknown>(LIBRARY_KEY);
  return migrateLibrary(value);
}

export async function saveLibrary(results: TrackResult[]): Promise<void> {
  const library: StoredLibrary = {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    results,
  };
  await writeLocal(LIBRARY_KEY, library);
}

export async function clearLibrary(): Promise<void> {
  await removeLocal(LIBRARY_KEY);
}
