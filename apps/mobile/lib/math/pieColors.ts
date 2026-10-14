// A pie's slices in the colour they are named after (#724). The model writes the labels; when a
// fraction circle's slices are called "Blau" and "Weiß", the question asks for "den blau gefärbten
// Anteil" — and the palette's first slot drew it violet. A question that names a colour she
// cannot find cannot be answered (rule 5).
//
// The names are the app's own, the ones it writes on Itten's colour wheel (`figure.hue_*`) and
// for the three plain colours (`figure.color_*`), in every language it speaks — the label must be
// one of them exactly (case, spaces, hyphens and ß aside). No language is read here: a label that
// is not one of these names keeps the palette's slot, as every chart label always has.

import { ITTEN_HUES, type Hue } from '../../../../packages/shared-math/src/itten.js';
import { resources, SUPPORTED_LOCALES } from '../i18n/resources.js';
import { type PLAIN_COLORS, type Figure } from '../theme/palettes.js';

/** A colour a slice can be named after: one of Itten's twelve, or a plain one. */
export type NamedColor = Hue | keyof typeof PLAIN_COLORS;

/** Where each plain colour's name stands (`math.json`, under `figure`). */
const PLAIN_KEYS: Record<keyof typeof PLAIN_COLORS, string> = {
  white: 'figure.color_white',
  grey: 'figure.color_grey',
  black: 'figure.color_black',
};

const fold = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[\s\-‐–]/g, '');

/** Every name of every colour, in every language the app speaks. */
export function colorNames(): ReadonlyMap<string, NamedColor> {
  const names = new Map<string, NamedColor>();
  for (const lang of SUPPORTED_LOCALES) {
    const figure: Record<string, string> = resources[lang].math.figure;
    for (const h of ITTEN_HUES) names.set(fold(figure[`hue_${h}`] ?? ''), h);
    for (const [c, key] of Object.entries(PLAIN_KEYS) as [keyof typeof PLAIN_COLORS, string][])
      names.set(fold(figure[key.slice('figure.'.length)] ?? ''), c);
  }
  names.delete('');
  return names;
}

const NAMES = colorNames();

/** The colour a label names, or null when it names none of the app's colours. */
export function namedColor(label: string): NamedColor | null {
  return NAMES.get(fold(label)) ?? null;
}

/** How that colour is drawn in this theme. */
function drawnColor(color: NamedColor, ink: Figure): string {
  if (color in ink.plain) return ink.plain[color as keyof typeof PLAIN_COLORS];
  return ink.hues[ITTEN_HUES.indexOf(color as Hue)] ?? ink.fill;
}

/**
 * Each slice's colour: the one its label names, else the palette's slot for it. A slot is never
 * given to two slices: a named slice takes its own colour, the others count on through the slots.
 */
export function sliceColors(labels: readonly string[], ink: Figure): string[] {
  let slot = 0;
  return labels.map((label) => {
    const named = namedColor(label);
    if (named) return drawnColor(named, ink);
    const color = ink.slices[slot % ink.slices.length] ?? ink.fill;
    slot += 1;
    return color;
  });
}
