// Typed-but-unsent text survives the process: Android kills a backgrounded app
// without warning, and a half-typed question must still be there afterwards.
// Photos (lib/capture/draftStorage.ts) and answers (lib/api/outbox.ts) already
// survive; text was the gap. Drafts count as local work: they belong to whoever
// was signed in and are wiped with the rest (lib/localWork.ts).

import { useEffect, useRef, useState } from 'react';

import { readItem, writeItem } from './api/outboxStorage.js';

const PREFIX = 'lb.draft.';
/** Keys every draft ever uses (chat + per-session answers share one wipe list). */
const INDEX_KEY = 'lb.draft.index';
const SAVE_AFTER_MS = 400;

/**
 * The drafts of this process, held synchronously (issue #239, CI walkthrough of PR #306).
 *
 * The device copy is written with a debounce and on unmount — both asynchronous. A remount
 * (the theme switch remounts the whole tree, lib/theme/ThemeProvider.tsx) used to read the
 * device copy before the old instance's write had landed, found nothing and showed an empty
 * field: what she had just typed was gone. Measured in CI: "2 H" typed, the dark→light
 * switch landed a moment later, and the field held "₂ + O₂ → 2 H₂O". The new instance now
 * reads this first; the device copy is for after a restart.
 */
const memory = new Map<string, string>();
const listeners = new Map<string, Set<(text: string) => void>>();
let generation = 0;

/** The existing account-wipe lifetime of shared text. */
export const draftGeneration = () => generation;

function publish(key: string, text: string): void {
  memory.set(key, text);
  listeners.get(key)?.forEach((receive) => receive(text));
}

/** An outcome may update the shared field without a mounted editor. */
export function updateDraft(name: string, update: (current: string) => string): void {
  const key = PREFIX + name;
  const next = update(memory.get(key) ?? '');
  publish(key, next);
  persist(key, next);
}

async function remember(key: string): Promise<void> {
  const kept = (await readItem(INDEX_KEY)) ?? '';
  const all = new Set(kept ? kept.split('\n') : []);
  if (all.has(key)) return;
  all.add(key);
  await writeItem(INDEX_KEY, [...all].join('\n'));
}

/** Deletes every kept draft (sign-out, another learner signs in). */
export async function clearDrafts(): Promise<void> {
  generation += 1;
  // Empty tombstones also prevent a concurrent device read from restoring the old account.
  memory.forEach((_text, key) => memory.set(key, ''));
  listeners.forEach((receivers) => receivers.forEach((receive) => receive('')));
  const kept = (await readItem(INDEX_KEY)) ?? '';
  await Promise.all(kept.split('\n').map((key) => (key ? writeItem(key, null) : undefined)));
  await writeItem(INDEX_KEY, null);
}

/**
 * The last keystrokes before an unmount are kept too, not only the debounce — in memory at
 * once (a remount reads them from there) and on the device, indexed, or the sign-out wipe
 * would miss them (review 28.09.).
 */
function persist(key: string, text: string): void {
  const owner = generation;
  if (text.trim().length > 0)
    void remember(key).then(() => {
      if (owner === generation && memory.get(key) === text) return writeItem(key, text);
    });
  else void writeItem(key, null);
}

/**
 * A text field whose value is kept on the device (debounced) and comes back
 * after a restart. `clear()` on a successful send; typing over a restored
 * draft replaces it.
 */
export function useDraft(name: string): {
  text: string;
  setText: (value: string | ((current: string) => string)) => void;
  clear: () => void;
} {
  const key = PREFIX + name;
  const [text, setValue] = useState('');
  const latest = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const owner = generation;
    const receive = (next: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      latest.current = next;
      setValue(next);
    };
    const receivers = listeners.get(key) ?? new Set<(text: string) => void>();
    receivers.add(receive);
    listeners.set(key, receivers);
    receive(memory.get(key) ?? '');
    if (!memory.has(key)) {
      void readItem(key).then((kept) => {
        if (alive && owner === generation && kept && !memory.has(key)) publish(key, kept);
      });
    }
    return () => {
      alive = false;
      receivers.delete(receive);
      if (receivers.size === 0) listeners.delete(key);
      if (timer.current) clearTimeout(timer.current);
      // Other editors and an account wipe are authoritative, never this old instance.
      if (owner === generation && memory.has(key)) persist(key, memory.get(key)!);
    };
  }, [key]);

  const setText = (value: string | ((current: string) => string)) => {
    const next = typeof value === 'function' ? value(memory.get(key) ?? latest.current) : value;
    publish(key, next);
    const owner = generation;
    timer.current = setTimeout(() => {
      if (owner === generation && memory.get(key) === next) persist(key, next);
    }, SAVE_AFTER_MS);
  };

  const clear = () => {
    publish(key, '');
    void writeItem(key, null);
  };

  return { text, setText, clear };
}

/**
 * A whole form kept on the device, not one field (issue #133 position 9).
 *
 * The profile step is where a parent and a child sit together and type a name, a birth
 * date and a language. Android kills a backgrounded app without warning, and losing that
 * means doing it again in exactly the moment they were already being patient. The PIN is
 * never part of it — a secret does not belong in a draft — and neither is the consent
 * checkbox: agreement is given, not restored.
 *
 * Same storage and the same wipe list as `useDraft`, so a sign-out takes it with
 * everything else that was local (lib/localWork.ts).
 */
export function useFormDraft<T extends Record<string, string | null>>(
  name: string,
  empty: T,
): { draft: T | null; keep: (next: T) => void; clear: () => void; ready: boolean } {
  const key = PREFIX + name;
  const [draft, setDraft] = useState<T | null>(null);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void readItem(key)
      .then((kept) => {
        if (!alive) return;
        if (kept) {
          try {
            const parsed: unknown = JSON.parse(kept);
            // Only the fields this form knows: a draft written by an older version must
            // not put a key back that no longer exists.
            if (parsed && typeof parsed === 'object') {
              const out = { ...empty };
              for (const k of Object.keys(empty) as Array<keyof T>) {
                const v = (parsed as Record<string, unknown>)[k as string];
                if (typeof v === 'string') out[k] = v as T[keyof T];
              }
              setDraft(out);
            }
          } catch {
            // Unreadable: it is a convenience, not data to recover at any cost.
          }
        }
        setReady(true);
      })
      .catch(() => setReady(true));
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
    // `empty` is the shape of the form, not a value to react to: it is written fresh on
    // every render and would restart this effect for ever.
  }, [key]);

  function keep(next: T): void {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void remember(key).then(() => writeItem(key, JSON.stringify(next)));
    }, SAVE_AFTER_MS);
  }

  function clear(): void {
    if (timer.current) clearTimeout(timer.current);
    setDraft(null);
    void writeItem(key, null);
  }

  return { draft, keep, clear, ready };
}
