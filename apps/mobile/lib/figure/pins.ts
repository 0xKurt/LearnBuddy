// Where the pins of a schematic drawing stand (issue #252): one 44 pt target per part, at the
// left or right margin or under the drawing, joined to its part by a leader line. Pure, so it is
// tested (`__tests__/pins.test.ts`) and the API's caps (contracts/schematics.ts) can be checked
// against what really fits.
//
// The pins of one side keep the order of their parts (top to bottom; left to right under the
// drawing), so leader lines never cross each other on that side, and each pin sits as close to
// its part's height as the 44 pt spacing lets it.

import { pinOrder, SCHEMATICS, type SchematicId } from '@learnbuddy/shared-types/contracts';

/** A pin's touch target (TOUCH in lib/theme/space.ts) and the gap the next one keeps. */
export const PIN = 44;
/** The visible pin inside its target. */
export const PIN_R = 15;
/**
 * Pins of a figure that is only READ (a naming question's numbers): nobody taps them, so they
 * are as small as a legible number allows and the drawing gets the room.
 */
const COMPACT = { pin: 26, r: 11 };

export type Pin = {
  id: string;
  /** 1, 2, 3 … in pin order — the number a question names. */
  n: number;
  x: number;
  y: number;
  /** The point on the part the leader line starts from, in px. */
  ax: number;
  ay: number;
};

export type PinLayout = {
  width: number;
  height: number;
  /** The visible radius of a pin. */
  r: number;
  /** Where the drawing (100 × h units) stands, and its scale. */
  art: { x: number; y: number; scale: number };
  pins: Pin[];
};

/** Spread wanted positions to at least `PITCH` apart within [lo, hi], keeping their order. */
function spread(wanted: number[], lo: number, hi: number, PITCH: number): number[] {
  const out = [...wanted];
  for (let i = 0; i < out.length; i++)
    out[i] = Math.max(out[i]!, i === 0 ? lo : out[i - 1]! + PITCH);
  for (let i = out.length - 1; i >= 0; i--)
    out[i] = Math.min(out[i]!, i === out.length - 1 ? hi : out[i + 1]! - PITCH);
  // When there is not room for all (never, within the caps), the first pass wins at the top.
  for (let i = 0; i < out.length; i++)
    out[i] = Math.max(out[i]!, i === 0 ? lo : out[i - 1]! + PITCH);
  return out;
}

/**
 * The layout for a drawing in a box. The drawing takes what the pin columns leave; the result's
 * height is what it really needs (never more than the box, unless the pins need it).
 */
export function pinLayout(
  drawing: SchematicId,
  parts: readonly string[],
  box: { width: number; height: number },
  { compact = false }: { compact?: boolean } = {},
): PinLayout {
  const PIN_SIZE = compact ? COMPACT.pin : PIN;
  const PITCH = PIN_SIZE + 4;
  const d = SCHEMATICS[drawing];
  const order = pinOrder(drawing, parts);
  const side = (s: 'l' | 'r' | 'b') => order.filter((id) => d.parts[id]!.side === s);
  const left = side('l');
  const right = side('r');
  const bottom = side('b');
  const colL = left.length > 0 ? PIN_SIZE + 8 : 0;
  const colR = right.length > 0 ? PIN_SIZE + 8 : 0;
  const rowB = bottom.length > 0 ? PIN_SIZE + 8 : 0;
  const pinsTall = Math.max(left.length, right.length) * PITCH - 4;
  const availW = Math.max(40, box.width - colL - colR);
  const availH = Math.max(40, box.height - rowB);
  const scale = Math.min(availW / 100, availH / d.h);
  const artW = 100 * scale;
  const artH = d.h * scale;
  const bodyH = Math.max(artH, pinsTall);
  const height = bodyH + rowB;
  const art = { x: colL + (availW - artW) / 2, y: (bodyH - artH) / 2, scale };
  const at = (id: string) => ({
    ax: art.x + d.parts[id]!.x * scale,
    ay: art.y + d.parts[id]!.y * scale,
  });
  const pins: Pin[] = [];
  const column = (ids: string[], x: number) => {
    const ys = spread(
      ids.map((id) => at(id).ay),
      PIN_SIZE / 2,
      bodyH - PIN_SIZE / 2,
      PITCH,
    );
    ids.forEach((id, i) => pins.push({ id, n: 0, x, y: ys[i]!, ...at(id) }));
  };
  column(left, PIN_SIZE / 2);
  column(right, box.width - PIN_SIZE / 2);
  const xs = spread(
    bottom.map((id) => at(id).ax),
    PIN_SIZE / 2,
    box.width - PIN_SIZE / 2,
    PITCH,
  );
  bottom.forEach((id, i) =>
    pins.push({ id, n: 0, x: xs[i]!, y: bodyH + 8 + PIN_SIZE / 2, ...at(id) }),
  );
  const numbered = order.map((id, i) => ({ ...pins.find((p) => p.id === id)!, n: i + 1 }));
  return { width: box.width, height, r: compact ? COMPACT.r : PIN_R, art, pins: numbered };
}

/** The pin a tap means: the nearest pin, or the pin of the nearest part's point. */
export function pinAt(layout: PinLayout, x: number, y: number): Pin | null {
  let best: Pin | null = null;
  let dist = Infinity;
  for (const p of layout.pins) {
    const d = Math.min(Math.hypot(p.x - x, p.y - y), Math.hypot(p.ax - x, p.ay - y));
    if (d < dist) {
      dist = d;
      best = p;
    }
  }
  return best;
}
