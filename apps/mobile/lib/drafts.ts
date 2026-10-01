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

async function remember(key: string): Promise<void> {
  const kept = (await readItem(INDEX_KEY)) ?? '';
  const all = new Set(kept ? kept.split('\n') : []);
  if (all.has(key)) return;
  all.add(key);
  await writeItem(INDEX_KEY, [...all].join('\n'));
}

/** Deletes every kept draft (sign-out, another learner signs in). */
export async function clearDrafts(): Promise<void> {
  const kept = (await readItem(INDEX_KEY)) ?? '';
  await Promise.all(kept.split('\n').map((key) => (key ? writeItem(key, null) : undefined)));
  await writeItem(INDEX_KEY, null);
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
    // A new key is a new field: the previous one's text must not stay on screen
    // (a session's answer draft in the next session, review 28.09.).
    latest.current = '';
    setValue('');
    void readItem(key).then((kept) => {
      // Whatever she typed before the read finished wins over the old draft.
      if (alive && kept && latest.current.length === 0) {
        latest.current = kept;
        setValue(kept);
      }
    });
    return () => {
      alive = false;
      // The last keystrokes before unmount are kept too, not only the debounce —
      // and indexed, or the sign-out wipe would miss them (review 28.09.).
      if (timer.current) clearTimeout(timer.current);
      if (latest.current.trim().length > 0) {
        void remember(key).then(() => writeItem(key, latest.current));
      } else {
        void writeItem(key, null);
      }
    };
  }, [key]);

  const setText = (value: string | ((current: string) => string)) => {
    const next = typeof value === 'function' ? value(latest.current) : value;
    latest.current = next;
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void remember(key);
      void writeItem(key, next.trim().length > 0 ? next : null);
    }, SAVE_AFTER_MS);
  };

  const clear = () => {
    latest.current = '';
    setValue('');
    if (timer.current) clearTimeout(timer.current);
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
