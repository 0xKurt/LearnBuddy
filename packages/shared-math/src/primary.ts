// Primary-school figures next to a question (issue #254): an analog clock, coins and notes, a
// Zwanzigerfeld or Hunderterfeld, base-ten blocks. docs/architecture.md §Practice, figures.
//
// The contracts are `ClockFigure` … `BaseTenFigure` in
// packages/shared-types/src/contracts/figure.ts; the shapes below are kept here so this module
// stays dependency-free (the app imports it by path to draw the hands). The API passes the
// zod-inferred figures in, so a drift between the two fails the typecheck.
//
// Rule 0 in both directions:
//   · what the model GENERATES is checked here — `primaryProblem` names the first rule a figure
//     breaks (a span needs two clocks, more dots than the field has, more pieces than fit a
//     phone); the caller rejects the question, never repairs the figure.
//   · what a question READS OFF is computed here (`primaryKey`): the time the hands show, the
//     span between two clocks, the amount the coins make, the number of dots or blocks. The
//     model's own key must agree with it, or the question is not asked.
//
// The hands are computed from the time and the time from the hands (`handAngles`,
// `timeFromHands`) — the same arithmetic both ways, so the drawing and the key cannot drift.

export type ClockFace = { h: number; m: number };
export type Clock = {
  type: 'clock';
  c: ClockFace[];
  h24: boolean;
  ask: 'time' | 'span' | 'none';
};
export type MoneyPiece =
  | '1ct'
  | '2ct'
  | '5ct'
  | '10ct'
  | '20ct'
  | '50ct'
  | '1€'
  | '2€'
  | '5€'
  | '10€'
  | '20€'
  | '50€'
  | '100€'
  | '200€';
export type Money = { type: 'money'; p: { d: MoneyPiece; n: number }[]; ask: 'sum' | 'none' };
export type DotField = {
  type: 'dot_field';
  field: 'twenty' | 'hundred';
  n: number[];
  ask: 'count' | 'none';
};
export type BaseTen = { type: 'base_ten'; h: number; t: number; o: number; ask: 'count' | 'none' };
export type Primary = Clock | Money | DotField | BaseTen;

const PRIMARY_NAMES: ReadonlySet<string> = new Set(['clock', 'money', 'dot_field', 'base_ten']);

export function isPrimary(f: { type: string }): f is Primary {
  return PRIMARY_NAMES.has(f.type);
}

/** The value of each euro piece in cents. A piece that is not here cannot be laid. */
export const MONEY_CENTS: Readonly<Record<MoneyPiece, number>> = {
  '1ct': 1,
  '2ct': 2,
  '5ct': 5,
  '10ct': 10,
  '20ct': 20,
  '50ct': 50,
  '1€': 100,
  '2€': 200,
  '5€': 500,
  '10€': 1000,
  '20€': 2000,
  '50€': 5000,
  '100€': 10000,
  '200€': 20000,
};

/** Coins are round, notes are paper: the drawing and the description both need to know. */
export function isCoin(d: MoneyPiece): boolean {
  return MONEY_CENTS[d] <= 200;
}

/** At most this many pieces of money: two rows on a 360 px phone. */
const MAX_MONEY_PIECES = 12;
/** At most this many blocks of base-ten material (plates + rods + cubes) on one figure. */
const MAX_BLOCKS = 30;

const FIELD_SIZE = { twenty: 20, hundred: 100 } as const;

export function fieldSize(f: DotField): number {
  return FIELD_SIZE[f.field];
}

// ─────────────── the clock: hands ↔ time ───────────────

/** Minutes on a twelve-hour dial (0 … 719): 7:45 and 19:45 are one position of the hands. */
const DIAL = 12 * 60;
const DAY = 24 * 60;

/**
 * The angles of the two hands in degrees, clockwise from 12: the minute hand moves 6° a minute,
 * the hour hand 30° an hour plus half a degree a minute — so at half past seven it stands
 * halfway between 7 and 8, as on a real clock.
 */
export function handAngles(t: ClockFace): { hour: number; minute: number } {
  const dial = (t.h * 60 + t.m) % DIAL;
  return { hour: dial / 2, minute: t.m * 6 };
}

/**
 * The time two hands show on a twelve-hour dial (0 ≤ h < 12), or null when they contradict each
 * other: an hour hand is only where it would be at the minute the minute hand shows (±3°, a
 * hand drawn or set by a finger is not exact). Minutes are read to the nearest whole minute.
 */
export function timeFromHands(hour: number, minute: number): ClockFace | null {
  const norm = (a: number) => ((a % 360) + 360) % 360;
  const m = Math.round(norm(minute) / 6) % 60;
  const expectedWithinHour = m / 2;
  const h = Math.round((norm(hour) - expectedWithinHour) / 30);
  const hh = ((h % 12) + 12) % 12;
  const drawn = norm(hour);
  const wanted = norm(hh * 30 + expectedWithinHour);
  const off = Math.min(Math.abs(drawn - wanted), 360 - Math.abs(drawn - wanted));
  return off <= 3 ? { h: hh, m } : null;
}

/** Two times are the same reading: on the dial (h24 false), 7:45 and 19:45 are; else exactly. */
export function sameTime(a: ClockFace, b: ClockFace, h24: boolean): boolean {
  const mod = h24 ? DAY : DIAL;
  return (a.h * 60 + a.m) % mod === (b.h * 60 + b.m) % mod;
}

/** The minutes from the first clock to the second, forwards (a dial cannot say more than 12 h). */
function spanMinutes(from: ClockFace, to: ClockFace, h24: boolean): number {
  const mod = h24 ? DAY : DIAL;
  const diff = (to.h * 60 + to.m - (from.h * 60 + from.m)) % mod;
  return (diff + mod) % mod;
}

// ─────────────── rules and keys ───────────────

/**
 * The first rule a primary-school figure breaks, or null when it holds. Rejected, never
 * repaired: a figure here IS the question ("Wie spät ist es?"), so a question without it is no
 * question at all.
 */
export function primaryProblem(f: Primary): string | null {
  switch (f.type) {
    case 'clock': {
      if (f.ask === 'time' && f.c.length !== 1) return 'a time is read off one clock';
      if (f.ask === 'span') {
        const [a, b] = f.c;
        if (!a || !b) return 'a span needs two clocks';
        if (spanMinutes(a, b, f.h24) === 0) return 'the two clocks show the same time';
      }
      return null;
    }
    case 'money': {
      const kinds = new Set(f.p.map((p) => p.d));
      if (kinds.size !== f.p.length) return 'each piece once, with its count';
      const pieces = f.p.reduce((s, p) => s + p.n, 0);
      if (pieces > MAX_MONEY_PIECES) return `more than ${MAX_MONEY_PIECES} pieces`;
      return null;
    }
    case 'dot_field': {
      const filled = f.n.reduce((s, n) => s + n, 0);
      if (filled > fieldSize(f)) return 'more dots than the field has';
      if (f.n.length === 2 && f.n.some((n) => n === 0)) return 'an empty second colour';
      return null;
    }
    case 'base_ten': {
      const blocks = f.h + f.t + f.o;
      if (blocks === 0) return 'no blocks';
      if (blocks > MAX_BLOCKS) return `more than ${MAX_BLOCKS} blocks`;
      return null;
    }
  }
}

/** What a question reads off a primary-school figure, computed from its data. */
export type PrimaryKey =
  | { kind: 'time'; time: ClockFace; h24: boolean }
  | { kind: 'span'; minutes: number }
  | { kind: 'amount'; cents: number }
  | { kind: 'count'; n: number };

/** The key the figure declares it answers (`ask`), or null when it declares none. */
export function primaryKey(f: Primary): PrimaryKey | null {
  if (f.ask === 'none' || primaryProblem(f) !== null) return null;
  switch (f.type) {
    case 'clock': {
      const [a, b] = f.c;
      if (!a) return null;
      if (f.ask === 'time') return { kind: 'time', time: a, h24: f.h24 };
      return b ? { kind: 'span', minutes: spanMinutes(a, b, f.h24) } : null;
    }
    case 'money':
      return { kind: 'amount', cents: f.p.reduce((s, p) => s + MONEY_CENTS[p.d] * p.n, 0) };
    case 'dot_field':
      return { kind: 'count', n: f.n.reduce((s, n) => s + n, 0) };
    case 'base_ten':
      return { kind: 'count', n: 100 * f.h + 10 * f.t + f.o };
  }
}

/**
 * A written clock time with digits only: "7:45", "7.45" (how German writes it) or a bare "7"
 * for seven o'clock. Null for anything else — "halb acht" or "Viertel vor 8" is language, and
 * reading it needs a word list (CLAUDE.md rule 3): that goes to the tutor.
 */
export function parseClockAnswer(text: string): ClockFace | null {
  const m = /^\s*(\d{1,2})(?:[:.]([0-5]\d))?\s*$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  return h <= 24 ? { h: h % 24, m: min } : null;
}
