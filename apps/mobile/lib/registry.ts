// The places where the generic Buddy takes what a domain adds (issue #107): a card in the chat,
// a way to start, the pages she attaches, how a formula is drawn and said. The core names the
// place and works without anything in it; the learning domain fills it once, from one place
// (lib/learning/register.tsx, called in app/_layout.tsx). The core never imports the domain.
//
// Filled twice is a wiring fault and throws — except in development, where Fast Refresh runs an
// edited module and everything that imports it once more: there the second filling replaces the
// first, so editing a card does not end on a red screen. Tests and release builds throw.

declare const __DEV__: boolean | undefined;

/** Whether a second filling replaces the first (Fast Refresh) instead of throwing. */
function refreshing(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/** One thing a domain may give; null while nobody did. */
export type Slot<T> = {
  readonly name: string;
  get(): T | null;
  fill(value: T): void;
};

export function slot<T>(name: string): Slot<T> {
  let value: T | null = null;
  return {
    name,
    get: () => value,
    fill(next) {
      if (value !== null && !refreshing()) throw new Error(`${name}: schon belegt (#107)`);
      value = next;
    },
  };
}

/** Several things by key, one per key, in the order they were given. */
export type Registry<K extends string, V> = {
  readonly name: string;
  get(key: K): V | undefined;
  keys(): K[];
  values(): V[];
  add(key: K, value: V): void;
};

export function registry<K extends string, V>(name: string): Registry<K, V> {
  const entries = new Map<K, V>();
  return {
    name,
    get: (key) => entries.get(key),
    keys: () => [...entries.keys()],
    values: () => [...entries.values()],
    add(key, value) {
      if (entries.has(key) && !refreshing()) throw new Error(`${name}: ${key} schon belegt (#107)`);
      entries.set(key, value);
    },
  };
}
