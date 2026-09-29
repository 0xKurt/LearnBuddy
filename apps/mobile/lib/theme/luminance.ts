// How light a palette's background is — the one thing the system bars need to know.
//
// The window behind the app, Android's navigation bar and the status bar are painted by
// the OS, not by a screen, so they cannot read `LB`. They ask here instead: a dark
// background needs light icons, a light one needs dark icons. Pure on purpose, so the
// decision is unit-tested without a device (lib/theme/__tests__/luminance.test.ts).
//
// lib/theme/__tests__/contrast.test.ts deliberately keeps its own copy of the luminance
// formula: a check must not be able to drift with the code it checks.

/** Relative luminance (WCAG 2.1) of a `#rgb` or `#rrggbb` colour: 0 = black, 1 = white. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Dark enough that white text/icons read better than black on it. 0.179 is the point
 * where the contrast against white and against black is equal (WCAG 2.1 §1.4.3).
 */
export function isDarkBackground(hex: string): boolean {
  return relativeLuminance(hex) < 0.179;
}

/**
 * What the status bar and Android's navigation bar wear over this background. The value
 * names the *content* colour, like `expo-status-bar`: `'dark'` = dark icons on a light bar.
 */
export function barStyleFor(background: string): 'light' | 'dark' {
  return isDarkBackground(background) ? 'light' : 'dark';
}

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** An unreadable colour counts as light: dark icons on an unknown bar are the safer guess. */
function rgb(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  const full =
    raw.length === 3
      ? `${raw[0] ?? ''}${raw[0] ?? ''}${raw[1] ?? ''}${raw[1] ?? ''}${raw[2] ?? ''}${raw[2] ?? ''}`
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [255, 255, 255];
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}
