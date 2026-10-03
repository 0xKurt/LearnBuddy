// The recordings she has already heard in this run (issues #210, #242), by their alias. Three
// questions about one listening text share it, so the second one offers "Nochmal hören" instead
// of announcing a text that is not new; a Diktat's card steps back once she heard the word. It
// belongs to the run, not to a question: a component keyed by the question would forget it.
// And it outlives a rebuild of the screen (a switch to the night palette remounts it): kept per
// run in memory — never on the device, there is nothing in it worth keeping.

import { useState } from 'react';

const HEARD = new Map<string, ReadonlySet<string>>();

export function useHeardTexts(runId: string): {
  heard: (ref: string | undefined) => boolean;
  markHeard: (ref: string | undefined) => void;
} {
  const [heard, setHeard] = useState<ReadonlySet<string>>(() => HEARD.get(runId) ?? new Set());
  return {
    heard: (ref) => ref !== undefined && heard.has(ref),
    markHeard: (ref) => {
      if (ref === undefined) return;
      setHeard((was) => {
        if (was.has(ref)) return was;
        const now = new Set(was).add(ref);
        if (runId) HEARD.set(runId, now);
        return now;
      });
    },
  };
}
