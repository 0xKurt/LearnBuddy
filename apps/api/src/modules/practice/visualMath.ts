// The arithmetic behind the pictures of issues #254 and #255: what a clock, some money, a solid,
// six squares or a point in space SAY — computed, so a key can never disagree with its drawing.
// docs/architecture.md §Practice ("Figures code draws from a task").
//
// Two directions, both by code (#224, "Regel 0"):
//   * generation — a task's own claim (a sum, a count, a volume, "is a net") is recomputed here;
//     a claim that differs costs the question (`practice/visual.ts`);
//   * answers — what she typed is read by a closed grammar (a time, an amount, three numbers)
//     and compared by value. Anything the grammar does not read fully is null: not "wrong", but
//     nothing code can claim — the ordinary rules and the tutor take it from there.

import {
  baseSides,
  type Denomination,
  type NetCell,
  type SolidAsk,
  type SolidDim,
  type SolidKind,
} from '@learnbuddy/shared-types/contracts';

// ─────────────── the clock ───────────────

export type ClockTime = { hour: number; minute: number };

/** Two times on a clock with hands: the same position of both hands (7:30 = 19:30). */
export function sameOnDial(a: ClockTime, b: ClockTime): boolean {
  return a.hour % 12 === b.hour % 12 && a.minute === b.minute;
}

/** The time as a key writes it: "7:05". */
export function clockKey(t: ClockTime): string {
  return `${t.hour}:${String(t.minute).padStart(2, '0')}`;
}

/**
 * The number words of the two languages whose clock phrases are read ("halb acht", "quarter to
 * eight"). Not a word list that guesses at meaning (CLAUDE.md rule 3): a closed grammar of how a
 * time is SAID, taught exactly this way in the Grundschule, and a phrase it does not read as a
 * whole is null — never a verdict.
 */
const DE_UNITS = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'];
const DE_WORDS: Record<string, number> = {
  null: 0,
  eins: 1,
  ein: 1,
  eine: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  dreizehn: 13,
  vierzehn: 14,
  fünfzehn: 15,
  sechzehn: 16,
  siebzehn: 17,
  achtzehn: 18,
  neunzehn: 19,
  zwanzig: 20,
};
for (let u = 1; u <= 9; u++) DE_WORDS[`${DE_UNITS[u] ?? ''}undzwanzig`] = 20 + u;

const EN_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  'twenty-five': 25,
  'twenty five': 25,
};

function numberOf(word: string, words: Record<string, number>): number | null {
  if (/^\d{1,2}$/.test(word)) return Number(word);
  return words[word] ?? null;
}

/** The hour before (halb acht → 7): 1 → 12. */
function before(hour: number): number {
  return hour === 1 ? 12 : hour === 13 ? 12 : hour - 1;
}

function valid(t: ClockTime): ClockTime | null {
  return t.hour >= 0 && t.hour <= 24 && t.minute >= 0 && t.minute <= 59
    ? { hour: t.hour % 24, minute: t.minute }
    : null;
}

/** "7:45", "7.45", "07:45 Uhr", "7 Uhr 45", "7h45", "7 Uhr", "7". */
function digital(s: string): ClockTime | null {
  const hm = /^(\d{1,2})\s*(?::|\.|h|uhr)\s*(\d{2})(?:\s*uhr)?$/.exec(s);
  if (hm) return valid({ hour: Number(hm[1]), minute: Number(hm[2]) });
  const h = /^(\d{1,2})(?:\s*(?:uhr|h|o'clock))?$/.exec(s);
  if (h) return valid({ hour: Number(h[1]), minute: 0 });
  return null;
}

function german(s: string): ClockTime | null {
  const n = (w: string) => numberOf(w, DE_WORDS);
  let m: RegExpExecArray | null;
  // "fünf nach halb acht", "zehn vor halb acht"
  if ((m = /^(\S+) (nach|vor) halb (\S+)$/.exec(s))) {
    const k = n(m[1] as string);
    const h = n(m[3] as string);
    if (k === null || h === null || k < 1 || k > 29 || h < 1 || h > 12) return null;
    return valid({ hour: before(h), minute: m[2] === 'nach' ? 30 + k : 30 - k });
  }
  if ((m = /^halb (\S+)$/.exec(s))) {
    const h = n(m[1] as string);
    return h === null || h < 1 || h > 12 ? null : { hour: before(h), minute: 30 };
  }
  if ((m = /^(dreiviertel|drei viertel|viertel) (\S+)$/.exec(s))) {
    const h = n(m[2] as string);
    if (h === null || h < 1 || h > 12) return null;
    return { hour: before(h), minute: m[1] === 'viertel' ? 15 : 45 };
  }
  // "viertel nach sieben", "zehn vor acht", "5 nach 7"
  if ((m = /^(\S+) (nach|vor) (\S+)$/.exec(s))) {
    const k = m[1] === 'viertel' ? 15 : n(m[1] as string);
    const h = n(m[3] as string);
    if (k === null || h === null || k < 1 || k > 29 || h < 1 || h > 12) return null;
    return m[2] === 'nach' ? { hour: h, minute: k } : valid({ hour: before(h), minute: 60 - k });
  }
  // "sieben uhr", "sieben uhr fünfundvierzig"
  if ((m = /^(\S+) uhr(?: (\S+))?$/.exec(s))) {
    const h = n(m[1] as string);
    const k = m[2] === undefined ? 0 : n(m[2] as string);
    if (h === null || k === null) return null;
    return valid({ hour: h, minute: k });
  }
  const h = n(s);
  return h !== null && h >= 1 && h <= 12 ? { hour: h, minute: 0 } : null;
}

function english(s: string): ClockTime | null {
  const n = (w: string) => numberOf(w, EN_WORDS);
  let m: RegExpExecArray | null;
  if ((m = /^half past (\S+)$/.exec(s))) {
    const h = n(m[1] as string);
    return h === null || h < 1 || h > 12 ? null : { hour: h, minute: 30 };
  }
  if ((m = /^(?:a )?quarter (past|to) (\S+)$/.exec(s))) {
    const h = n(m[2] as string);
    if (h === null || h < 1 || h > 12) return null;
    return m[1] === 'past' ? { hour: h, minute: 15 } : { hour: before(h), minute: 45 };
  }
  if ((m = /^(\S+(?: five)?)(?: minutes?)? (past|to) (\S+)$/.exec(s))) {
    const k = n(m[1] as string);
    const h = n(m[3] as string);
    if (k === null || h === null || k < 1 || k > 29 || h < 1 || h > 12) return null;
    return m[2] === 'past' ? { hour: h, minute: k } : { hour: before(h), minute: 60 - k };
  }
  if ((m = /^(\S+) o'clock$/.exec(s))) {
    const h = n(m[1] as string);
    return h === null || h < 1 || h > 12 ? null : { hour: h, minute: 0 };
  }
  return null;
}

/**
 * A time she typed, or null when the whole text is not one. Digits in every language; the
 * spoken forms in German ("halb acht", "viertel vor acht", "dreiviertel acht", "fünf nach halb
 * acht") and English ("half past seven", "quarter to eight"). The other languages' phrases are
 * not read — such an answer goes to the ordinary rules and the tutor, never to "wrong".
 */
export function parseClockAnswer(text: string, locale: string): ClockTime | null {
  let s = text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!]$/, '')
    .trim();
  const lang = locale.slice(0, 2);
  if (lang === 'de') s = s.replace(/^(?:es ist |um )/, '');
  if (lang === 'en') s = s.replace(/^(?:it's |it is |at )/, '');
  const d = digital(s);
  if (d) return d;
  if (lang === 'de') return german(s);
  if (lang === 'en') return english(s);
  return null;
}

// ─────────────── money ───────────────

/**
 * An amount she typed, in cent — or null when it is not plainly one. "3,45 €", "3.45", "€3.45",
 * "3,45 Euro", "345 ct", "345 Cent", "3 € 45", "3 Euro 45 Cent". A number without a unit is
 * returned as `{ bare }`: whether "345" means euros or cent is not code's to guess, so the caller
 * accepts it only when one of the two readings is the key.
 */
export type TypedAmount = { cents: number } | { bare: number };

export function parseAmount(text: string): TypedAmount | null {
  const s = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const euroWord = '(?:€|euro|eur)';
  const centWord = '(?:ct|cent|cents|c)';
  const num = '(\\d{1,4}(?:[.,]\\d{1,2})?)';
  let m: RegExpExecArray | null;
  const asNumber = (raw: string) => Number(raw.replace(',', '.'));
  const whole = (n: number) => Math.round(n * 100);
  // "3 € 45", "3 euro 45 cent"
  if ((m = new RegExp(`^(\\d{1,4}) ?${euroWord} ?(\\d{1,2})(?: ?${centWord})?$`).exec(s))) {
    return { cents: Number(m[1]) * 100 + Number(m[2]) };
  }
  const euros =
    new RegExp(`^${num} ?${euroWord}$`).exec(s) ?? new RegExp(`^${euroWord} ?${num}$`).exec(s);
  if (euros) return { cents: whole(asNumber(euros[1] as string)) };
  if ((m = new RegExp(`^(\\d{1,6}) ?${centWord}$`).exec(s))) return { cents: Number(m[1]) };
  if ((m = /^(\d{1,4})[.,](\d{1,2})$/.exec(s))) {
    return { cents: Number(m[1]) * 100 + Number((m[2] as string).padEnd(2, '0')) };
  }
  if ((m = /^\d{1,6}$/.exec(s))) return { bare: Number(m[0]) };
  return null;
}

/** Does what she typed name this amount? Null when it is no amount at all. */
export function amountMatches(text: string, cents: number): boolean | null {
  const typed = parseAmount(text);
  if (typed === null) return null;
  if ('cents' in typed) return typed.cents === cents;
  return typed.bare * 100 === cents || typed.bare === cents;
}

/** Coins she laid, greedily largest first — the one way a worked solution names. */
export function fewestPieces(cents: number, offer: readonly Denomination[]): Denomination[] {
  const out: Denomination[] = [];
  let left = cents;
  for (const d of [...offer].sort((a, b) => b - a)) {
    while (left >= d) {
      out.push(d);
      left -= d;
    }
  }
  return left === 0 ? out : [];
}

// ─────────────── three numbers ───────────────

/**
 * A point or a vector she typed: exactly three numbers — "(2|3|1)", "2 | 3 | 1", "(2;3;1)",
 * "P(2|3|1)", "2, 3, 1", "2 3 1". Null for anything else. A comma separates only when there is no
 * other separator and it gives exactly three whole numbers (otherwise it might be a decimal comma).
 */
export function parseTriple(text: string): [number, number, number] | null {
  const s = text
    .trim()
    .replace(/[−–]/g, '-')
    .replace(/^[a-z]{1,2}\s*=?\s*/i, '')
    .replace(/^[([{]\s*/, '')
    .replace(/\s*[)\]}]$/, '')
    .trim();
  if (s === '') return null;
  let parts: string[];
  if (/[|;/]/.test(s)) parts = s.split(/\s*[|;/]\s*/);
  else if (/^-?\d+\s*,\s*-?\d+\s*,\s*-?\d+$/.test(s)) parts = s.split(/\s*,\s*/);
  else parts = s.split(/\s+/);
  if (parts.length !== 3) return null;
  const nums = parts.map((p) =>
    /^-?\d+(?:[.,]\d+)?$/.test(p) ? Number(p.replace(',', '.')) : NaN,
  );
  if (nums.some((n) => !Number.isFinite(n))) return null;
  return nums as [number, number, number];
}

// ─────────────── solids ───────────────

/** Vertices, edges and faces of a polyhedron with an n-gon base (Euler: V − E + F = 2). */
export function solidCounts(
  solid: SolidKind,
): { vertices: number; edges: number; faces: number } | null {
  const n = baseSides(solid);
  if (n === null) return null;
  if (solid.startsWith('pyramid')) return { vertices: n + 1, edges: 2 * n, faces: n + 1 };
  return { vertices: 2 * n, edges: 3 * n, faces: n + 2 };
}

function dim(dims: readonly SolidDim[], name: SolidDim['name']): number {
  return dims.find((d) => d.name === name)?.value ?? NaN;
}

/** The area of a regular n-gon with side a. */
function polygonArea(n: number, a: number): number {
  return (n * a * a) / (4 * Math.tan(Math.PI / n));
}

/** The apothem (centre to the middle of a side) of a regular n-gon with side a. */
function apothem(n: number, a: number): number {
  return a / (2 * Math.tan(Math.PI / n));
}

/**
 * Volume or surface from the measures, with any value of π (the textbook 3.14 or the real one):
 * a learner who computed with 3.14 is right too (`practice/visual.ts` accepts both).
 */
export function solidMeasure(
  solid: SolidKind,
  ask: Extract<SolidAsk, 'volume' | 'surface'>,
  dims: readonly SolidDim[],
  pi = Math.PI,
): number {
  const a = dim(dims, 'a');
  const b = dim(dims, 'b');
  const h = dim(dims, 'h');
  const r = dim(dims, 'r');
  const n = baseSides(solid);
  switch (solid) {
    case 'cube':
      return ask === 'volume' ? a ** 3 : 6 * a * a;
    case 'cuboid':
      return ask === 'volume' ? a * b * h : 2 * (a * b + a * h + b * h);
    case 'cylinder':
      return ask === 'volume' ? pi * r * r * h : 2 * pi * r * r + 2 * pi * r * h;
    case 'cone':
      return ask === 'volume' ? (pi * r * r * h) / 3 : pi * r * r + pi * r * Math.hypot(r, h);
    case 'sphere':
      return ask === 'volume' ? (4 / 3) * pi * r ** 3 : 4 * pi * r * r;
    default: {
      const sides = n ?? 4;
      const base = polygonArea(sides, a);
      if (solid.startsWith('pyramid')) {
        if (ask === 'volume') return (base * h) / 3;
        const slant = Math.hypot(h, apothem(sides, a));
        return base + (sides * a * slant) / 2;
      }
      return ask === 'volume' ? base * h : 2 * base + sides * a * h;
    }
  }
}

/** Does a solid use π? Then a learner with 3.14 is right as well. */
export function usesPi(solid: SolidKind): boolean {
  return solid === 'cylinder' || solid === 'cone' || solid === 'sphere';
}

// ─────────────── cube nets ───────────────

type Vec = readonly [number, number, number];
const neg = (v: Vec): Vec => [-v[0], -v[1], -v[2]];
const key3 = (v: Vec) => v.join(',');

/** Six distinct squares, each touching another along an edge. */
export function connected(cells: readonly NetCell[]): boolean {
  const keys = new Set(cells.map((c) => `${c.col},${c.row}`));
  if (keys.size !== cells.length || cells.length === 0) return false;
  const first = cells[0] as NetCell;
  const seen = new Set([`${first.col},${first.row}`]);
  const queue = [first];
  while (queue.length > 0) {
    const c = queue.shift() as NetCell;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const k = `${c.col + dc},${c.row + dr}`;
      if (keys.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push({ col: c.col + dc, row: c.row + dr });
      }
    }
  }
  return seen.size === keys.size;
}

/**
 * Does this net fold into a cube? It is folded, square by square: each square carries the
 * outward normal of the cube face it lands on and the two directions of the grid; stepping to a
 * neighbour rolls that frame over the shared edge. A net is one exactly when the six squares land
 * on six different faces. Requires `connected` (a loose square folds onto nothing).
 */
export function foldsToCube(cells: readonly NetCell[]): boolean {
  if (cells.length !== 6 || !connected(cells)) return false;
  type Frame = { n: Vec; u: Vec; v: Vec };
  const at = new Map<string, Frame>();
  const first = cells[0] as NetCell;
  at.set(`${first.col},${first.row}`, { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] });
  const cellKeys = new Set(cells.map((c) => `${c.col},${c.row}`));
  const queue: NetCell[] = [first];
  while (queue.length > 0) {
    const c = queue.shift() as NetCell;
    const f = at.get(`${c.col},${c.row}`) as Frame;
    const steps: Array<[number, number, Frame]> = [
      [1, 0, { n: f.u, u: neg(f.n), v: f.v }],
      [-1, 0, { n: neg(f.u), u: f.n, v: f.v }],
      [0, 1, { n: f.v, u: f.u, v: neg(f.n) }],
      [0, -1, { n: neg(f.v), u: f.u, v: f.n }],
    ];
    for (const [dc, dr, frame] of steps) {
      const k = `${c.col + dc},${c.row + dr}`;
      if (!cellKeys.has(k) || at.has(k)) continue;
      at.set(k, frame);
      queue.push({ col: c.col + dc, row: c.row + dr });
    }
  }
  return new Set([...at.values()].map((f) => key3(f.n))).size === 6;
}
