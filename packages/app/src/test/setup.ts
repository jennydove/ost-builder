import '@testing-library/jest-dom';

// Node 22+ declares globalThis.localStorage but leaves it undefined unless
// --localstorage-file is passed. This shadows jsdom's working implementation.
// Polyfill with a simple in-memory store so tests that use window.localStorage work.
if (typeof globalThis.localStorage === 'undefined') {
  const store: Record<string, string> = {};
  const storage: Storage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, writable: true });
  Object.defineProperty(window, 'localStorage', { value: storage, writable: true });
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
