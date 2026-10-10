// How a text is said aloud (issue #107): the notation a domain writes — the learning domain's
// $…$ math — in words of the app language ("3 Viertel"), for the voice and for screen readers.
// The domain gives the hook once at app start (lib/learning/register.tsx); without one a text
// is said as it is written.

import { slot } from '../registry.js';

/** A text as it is said (its Markdown is already gone, lib/buddy/markdown.ts markdownPlain). */
export type Say = (text: string) => string;

/** The hook that gives the words for the notation in the app language. */
export const sayNotation = slot<() => Say>('Notation vorlesen');

const asWritten: Say = (text) => text;

function useAsWritten(): Say {
  return asWritten;
}

/** How texts are said here and now; the same function while the app language stays. */
export function useSay(): Say {
  // Filled once before the first render: every render calls the same hook.
  const use = sayNotation.get() ?? useAsWritten;
  return use();
}
