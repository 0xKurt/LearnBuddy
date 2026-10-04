// How a row of keys lays itself out on one line (issue #310 step 4; the row is
// components/lb/KeyRow.tsx). One rule for every key row of the practice screen — the math and
// chemistry keys under a field (issue #239) and the note line's two rows (issue #275):
//
//   · one line, never sideways: a key she has to scroll to find is a key she does not know exists
//     (#286 finding 5). As many places as fit; when more keys are needed, the last place holds
//     "…", which turns to the next page;
//   · every key is at least TOUCH (44 pt) wide and tall, the gap between two keys SPACE.sm;
//   · all places of a line are equally wide. A row that nearly fills the line fills it, so six
//     keys on a seven-place line share the whole width instead of leaving a hole at the right; a
//     short row (three keys) keeps its size. A row that should always span the line (`fill`, the
//     note line's keys under a staff of the same width) shares it whatever it holds.
//
// Pure, without React Native, so the unit tests run it.

/** The smallest key (TOUCH in lib/theme/space.ts) and the gap between two keys (SPACE.sm). */
const KEY_MIN = 44;
export const KEY_GAP = 8;

/** The row on the narrowest phone the app is made for: 360 pt less the screen's two 16 pt sides. */
export const NARROW_ROW = 328;

/** How many key places one line of this width holds. */
export function slotsIn(width: number): number {
  return Math.max(3, Math.floor((width + KEY_GAP) / (KEY_MIN + KEY_GAP)));
}

/**
 * How many places the line is cut into: what fits, or — where the keys (nearly) fill it, or the
 * row is to span the line anyway — exactly as many as the keys take.
 */
export function placesOnLine(taken: number, fits: number, fill = false): number {
  if (taken <= fits && (fill || taken >= fits - 1)) return Math.max(1, taken);
  return fits;
}

/**
 * The keys split into pages of one line each. Everything on one page when it fits; otherwise
 * every page keeps its last place for the "…" key that turns to the next page.
 */
export function pagesOf<T>(keys: readonly T[], slots: number, placesOf: (key: T) => number): T[][] {
  const total = keys.reduce((n, key) => n + placesOf(key), 0);
  if (total <= slots) return keys.length > 0 ? [[...keys]] : [];
  const room = slots - 1;
  const pages: T[][] = [];
  let page: T[] = [];
  let used = 0;
  for (const key of keys) {
    const need = placesOf(key);
    if (used + need > room && page.length > 0) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(key);
    used += need;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

/** The width of a key of `places` places on a line of `slots` places: its places and the gaps between. */
export function keyWidth(row: number, slots: number, places: number): number {
  const cell = (row - KEY_GAP * (slots - 1)) / slots;
  return Math.floor(places * cell + (places - 1) * KEY_GAP);
}
