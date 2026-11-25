/** Minimal chrome.storage.local stand-in so auth/storage code runs in tests. */
export function installFakeStorage(): Map<string, unknown> {
  const store = new Map<string, unknown>();
  const area = {
    get(keys: string | string[], callback: (values: Record<string, unknown>) => void) {
      const list = Array.isArray(keys) ? keys : [keys];
      const values: Record<string, unknown> = {};
      for (const key of list) if (store.has(key)) values[key] = store.get(key);
      callback(values);
    },
    set(values: Record<string, unknown>, callback: () => void) {
      for (const [key, value] of Object.entries(values)) store.set(key, value);
      callback();
    },
    remove(keys: string | string[], callback: () => void) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
      callback();
    },
  };
  (globalThis as typeof globalThis & { chrome?: unknown }).chrome = {
    runtime: { id: 'test-extension' },
    storage: { local: area },
  };
  return store;
}
