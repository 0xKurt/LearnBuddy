// Eine Anzeige-Reihenfolge, die stabil pro Frage ist — ohne Uhr und ohne Zufallsquelle.
//
// Die Regel stand zuerst in `tapChoices.ts` (issue #147) und gilt für jede gemischte Anzeige:
// ein Neuladen des Bildschirms darf die Elemente nicht unter ihrem Finger neu mischen, und der
// Walkthrough muss denselben Satz zweimal sehen. `Math.random()` kann das nicht, und eine Uhr
// darf es nicht (CLAUDE.md Regel 7: Code rechnet mit `deps.now()`, und eine Darstellung hängt
// an der Frage, nicht am Augenblick).
//
// Seit den mehrteiligen Antworten (issues #228–#230) braucht es dasselbe an vier Stellen —
// Elemente einer Reihenfolge, die linke und die rechte Spalte einer Zuordnung, die Elemente
// einer Gruppierung. Deshalb steht es hier, einmal, statt viermal daneben.

/**
 * Ein Startwert aus einer Zeichenkette (FNV-1a). Für dieselbe Item-Id immer derselbe Wert, auf
 * jedem Rechner und in jedem Prozess.
 */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Der nächste Wert einer kleinen, festen Folge (numerical recipes LCG). */
function step(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

/**
 * Die Elemente in einer Reihenfolge, die nur vom Startwert abhängt (Fisher–Yates mit der Folge
 * oben). Gleiche Eingabe, gleicher Startwert → gleiche Ausgabe, immer.
 */
export function stableShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = step(seed || 1);
  for (let i = out.length - 1; i > 0; i--) {
    state = step(state);
    const j = state % (i + 1);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/**
 * Dieselbe Mischung, aber garantiert **nicht** die Ausgangsreihenfolge.
 *
 * Bei einer Reihenfolgeaufgabe ist die Ausgangsreihenfolge die Lösung: sie unverändert
 * anzuzeigen würde die Antwort hinlegen. Bei drei Elementen trifft eine Mischung das mit
 * Wahrscheinlichkeit 1/6 — selten, aber „selten" ist für ein Kind, dem es passiert, kein
 * Argument. Trifft sie zu, werden die ersten beiden getauscht: das ist wieder eine feste,
 * nachrechenbare Entscheidung und keine zweite Ziehung.
 */
export function shuffledAway<T>(items: readonly T[], seed: number): T[] {
  const out = stableShuffle(items, seed);
  if (items.length < 2) return out;
  if (out.some((x, i) => x !== items[i])) return out;
  const first = out[0] as T;
  out[0] = out[1] as T;
  out[1] = first;
  return out;
}
