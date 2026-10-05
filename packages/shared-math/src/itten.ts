// Itten's colour wheel as data (issue #261, docs/architecture.md §Practice, Circuits): twelve
// fields clockwise from yellow at the top — the primaries at 0, 4, 8 (yellow, red, blue), the
// secondaries between them at 2, 6, 10 (orange, violet, green), the tertiaries at the odd places.
//
// What a question asks is COMPUTED here from the places, never from a colour space: Itten's
// complement of red is green (opposite, six places on), not RGB's cyan. A mixture is the field
// halfway between two others when Itten's wheel shows it as one: two primaries give the secondary
// between them, a primary and its neighbouring secondary the tertiary between them. A question
// that asks for anything else is rejected, never repaired (`colorWheelProblem`).
//
// Dependency-free on purpose: the app imports this file by path.

export const ITTEN_HUES = [
  'yellow',
  'yellow_orange',
  'orange',
  'red_orange',
  'red',
  'red_violet',
  'violet',
  'blue_violet',
  'blue',
  'blue_green',
  'green',
  'yellow_green',
] as const;
export type Hue = (typeof ITTEN_HUES)[number];
export type ColorWheel = {
  type: 'color_wheel';
  /** The marked fields; a multiple choice's options, in this order. */
  hl: readonly Hue[];
  ask: 'none' | 'complement' | 'mix' | 'class';
  /** complement, class: the colour asked about · mix: the two colours mixed · none: []. */
  at: readonly Hue[];
};

export function isColorWheel(f: { type: string }): f is ColorWheel {
  return f.type === 'color_wheel';
}

export type HueClass = 'primary' | 'secondary' | 'tertiary';
export const HUE_CLASSES: readonly HueClass[] = ['primary', 'secondary', 'tertiary'];

export const hueIndex = (h: Hue) => ITTEN_HUES.indexOf(h);
const hueAt = (i: number): Hue => ITTEN_HUES[((i % 12) + 12) % 12]!;

export function hueClass(h: Hue): HueClass {
  const i = hueIndex(h);
  return i % 4 === 0 ? 'primary' : i % 2 === 0 ? 'secondary' : 'tertiary';
}

/** The field opposite, six places on. */
export const complementOf = (h: Hue): Hue => hueAt(hueIndex(h) + 6);

/** What two fields mix to on Itten's wheel; null when it shows no such mixture. */
export function mixOf(a: Hue, b: Hue): Hue | null {
  const ia = hueIndex(a);
  const fwd = (((hueIndex(b) - ia) % 12) + 12) % 12;
  const [from, gap] = fwd <= 6 ? [ia, fwd] : [hueIndex(b), 12 - fwd];
  const classes = [hueClass(a), hueClass(b)].sort().join('+');
  const twoPrimaries = gap === 4 && classes === 'primary+primary';
  const primaryAndSecondary = gap === 2 && classes === 'primary+secondary';
  return twoPrimaries || primaryAndSecondary ? hueAt(from + gap / 2) : null;
}

export type ColorWheelKey = { kind: 'hue'; hue: Hue } | { kind: 'class'; index: number };

/** The key the wheel's question asks for; null when it asks nothing computable. */
export function colorWheelKey(w: ColorWheel): ColorWheelKey | null {
  const [a, b] = w.at;
  if (w.ask === 'complement' && a && w.at.length === 1)
    return { kind: 'hue', hue: complementOf(a) };
  if (w.ask === 'class' && a && w.at.length === 1)
    return { kind: 'class', index: HUE_CLASSES.indexOf(hueClass(a)) };
  if (w.ask === 'mix' && a && b && w.at.length === 2) {
    const hue = mixOf(a, b);
    return hue === null ? null : { kind: 'hue', hue };
  }
  return null;
}

export type ColorWheelProblem =
  /** A field marked twice. */
  | 'marks'
  /** The question asks for what the wheel cannot answer (two colours it shows no mixture of). */
  | 'ask';

/** The first rule a wheel breaks, or null when it holds. */
export function colorWheelProblem(w: ColorWheel): ColorWheelProblem | null {
  if (new Set(w.hl).size !== w.hl.length) return 'marks';
  if (w.ask === 'none' ? w.at.length > 0 : colorWheelKey(w) === null) return 'ask';
  return null;
}
