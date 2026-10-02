// The parts of app.json that paint before any of our code runs (issues #177, #194). They are
// native: a wrong value here shows only after a rebuild, on a phone, at start-up — so the
// colours are tied to the palettes here instead of trusted to stay in step by hand.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_FAMILY, paletteOf, themeNameOf } from '../palettes.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

type SplashOptions = {
  image: string;
  backgroundColor: string;
  dark?: { image?: string; backgroundColor?: string };
};
type AppJson = {
  expo: {
    userInterfaceStyle?: string;
    backgroundColor?: string;
    ios?: { icon?: string | { light?: string; dark?: string; tinted?: string } };
    plugins: (string | [string, unknown])[];
  };
};

const app = (JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8')) as AppJson).expo;

function splash(): SplashOptions {
  const entry = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  if (!Array.isArray(entry)) throw new Error('expo-splash-screen is not configured');
  return entry[1] as SplashOptions;
}

const light = paletteOf(themeNameOf(DEFAULT_FAMILY, false));
const night = paletteOf(themeNameOf(DEFAULT_FAMILY, true));

describe('what the OS paints before the app', () => {
  it('lets the phone decide light or dark until the app says which it shows', () => {
    // "light" pinned AppCompat's night mode to "no": every sheet's own window then got a
    // light navigation bar on the night palette (#177), and the dark splash below could
    // never be chosen. The app itself names the side it shows (lib/theme/systemScheme.ts).
    expect(app.userInterfaceStyle).toBe('automatic');
  });

  it('starts on the page colour in light and on the night ground in dark (#194)', () => {
    const s = splash();
    expect(s.backgroundColor).toBe(light.bg);
    expect(app.backgroundColor).toBe(light.bg);
    expect(s.dark?.backgroundColor).toBe(night.bg);
  });

  it('has a dark splash picture of its own, never the light one on a dark ground', () => {
    // The light picture carries the light page colour baked in (scripts/brand/render-icons.mjs
    // says why): on a dark window it is the white square of #194.
    const s = splash();
    expect(s.dark?.image).toBeDefined();
    expect(s.dark?.image).not.toBe(s.image);
    expect(existsSync(resolve(root, s.dark?.image ?? ''))).toBe(true);
  });

  it('gives iOS a dark and a tinted icon that exist', () => {
    const icon = app.ios?.icon;
    if (typeof icon !== 'object') throw new Error('ios.icon has no variants');
    for (const file of [icon.light, icon.dark, icon.tinted]) {
      expect(file).toBeDefined();
      expect(existsSync(resolve(root, file ?? ''))).toBe(true);
    }
  });
});
