// Which ground the page shows before any of the app has run (issue #194).
//
// The browser paints its own white, then the bundle loads, then `restoreTheme()` applies
// her palette — three steps, and the owner filmed the middle one: "~0,3 s weiße Fläche"
// before the app appeared. On the light palettes nobody notices; on the night palette it
// is a white flash in a dark room.
//
// `app/+html.tsx` runs this rule as an inline script in the page head, before the first
// paint, with no bundle loaded — so there it is a string that no type checker reads. This
// is the same rule in TypeScript, and the tests next to it are what keep the two honest.
//
// Deliberately forgiving everywhere: what is in storage is text, and text can be anything
// (issue #172). Every unknown value falls back to what the app would have shown anyway.

import { DEFAULT_MODE, FAMILIES, PALETTES, themeNameOf, type Family } from './palettes.js';

/** `{ pastell: '#faf7fd', pastellDark: '#191627', … }` — the only thing the script needs. */
export const GROUNDS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(PALETTES).map(([name, palette]) => [name, palette.bg]),
);

/**
 * The two values `ThemeProvider` keeps (`lb.theme`, `lb.themeMode`) resolved to a colour.
 * `systemIsDark` is what `prefers-color-scheme` says, for the default "follow the phone".
 */
export function groundFor(
  family: string | null,
  mode: string | null,
  systemIsDark: boolean,
): string {
  let f = family;
  let m = mode;
  // A device from before the two axes kept "night" as a family (issue #140); it was
  // showing pastell in dark, so that is what it gets.
  if (f === 'night') {
    f = 'pastell';
    m = 'dark';
  }
  // Against the FAMILIES, not against the colour table: that table also holds the dark
  // keys ("pastellDark"), so checking it would accept one as a family and answer with the
  // dark ground even when she asked for light. The test caught exactly that.
  if (f === null || !(FAMILIES as readonly string[]).includes(f)) f = 'pastell';
  if (m !== 'light' && m !== 'dark') m = DEFAULT_MODE;
  const dark = m === 'dark' || (m === 'system' && systemIsDark);
  return GROUNDS[themeNameOf(f as Family, dark)] ?? GROUNDS.pastell!;
}
