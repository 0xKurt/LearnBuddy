// What only a native build shows, held in the config it is built from (#194, #177, #710). The
// build itself, and how it looks on the phone, comes in the device phase; this proves the config
// says what the issues decided.
//
//   #194  the native start screen in dark mode: a dark variant whose image is baked opaque on the
//         dark page colour (MIUI composites alpha wrongly, so no transparency), the light one on
//         the light page colour — both exactly the palettes' `bg`.
//   #177  the navigation bar under a sheet: the plugin that rewrites React Native's Modal window
//         theme is registered and keeps React Native's own items.
//   #710  Reanimated applies transform and opacity straight to the views on Android: the static
//         flag is set in package.json, under a name the installed Reanimated knows.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { PALETTES } from '../theme/palettes.js';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as {
  expo: { plugins: Array<string | [string, Record<string, unknown>]> };
};
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  reanimated?: { staticFeatureFlags?: Record<string, boolean> };
};

/** Where an installed package lives (its files beside its exports). */
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

function plugin(name: string): Record<string, unknown> | null {
  for (const p of appJson.expo.plugins) {
    if (p === name) return {};
    if (Array.isArray(p) && p[0] === name) return p[1];
  }
  return null;
}

/** A PNG's colour type and its top-left pixel as #rrggbb (the first pixel is unfiltered). */
function png(path: string): { colorType: number; corner: string } {
  const b = readFileSync(join(ROOT, path));
  const colorType = b[25]!;
  const chunks: Buffer[] = [];
  for (let at = 8; at < b.length; ) {
    const len = b.readUInt32BE(at);
    const type = b.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') chunks.push(b.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return { colorType, corner: `#${hex(raw[1]!)}${hex(raw[2]!)}${hex(raw[3]!)}` };
}

describe('the native start screen follows day and night (#194)', () => {
  const splash = plugin('expo-splash-screen') as {
    image: string;
    backgroundColor: string;
    dark?: { image: string; backgroundColor: string };
  } | null;

  it('has a light screen on the light page colour, the image baked opaque on it', () => {
    expect(splash?.backgroundColor).toBe(PALETTES.pastell.bg);
    const light = png(splash!.image);
    expect(light.colorType).toBe(2);
    expect(light.corner).toBe(PALETTES.pastell.bg);
  });

  it('has a dark screen on the dark page colour, the image baked opaque on it', () => {
    expect(splash?.dark?.backgroundColor).toBe(PALETTES.pastellDark.bg);
    const dark = png(splash!.dark!.image);
    expect(dark.colorType).toBe(2);
    expect(dark.corner).toBe(PALETTES.pastellDark.bg);
  });
});

describe('the navigation bar under a sheet (#177)', () => {
  it('rewrites the Modal window theme in a plugin that is registered', () => {
    expect(plugin('./plugins/withModalNavigationBar.js')).not.toBeNull();
  });

  it("keeps React Native's own items, and lets the sheet fill the bar by day and night", () => {
    const { modalThemeXml, RN_ITEMS } = require('../../plugins/withModalNavigationBar.js') as {
      modalThemeXml: (night: boolean) => string;
      RN_ITEMS: Array<[string, string]>;
    };
    const rnThemes = readFileSync(
      join(packageDir('react-native'), 'ReactAndroid/src/main/res/views/modal/values/themes.xml'),
      'utf8',
    );
    const base = rnThemes.slice(
      rnThemes.indexOf('<style name="Theme.FullScreenDialog">'),
      rnThemes.indexOf('</style>'),
    );
    for (const [name, value] of RN_ITEMS)
      expect(base).toContain(`<item name="${name}">${value}</item>`);
    expect(base.match(/<item /g)).toHaveLength(RN_ITEMS.length);
    for (const night of [false, true]) {
      const xml = modalThemeXml(night);
      expect(xml).toContain('<style name="Theme.FullScreenDialog">');
      expect(xml).toContain(
        '<item name="android:navigationBarColor">@android:color/transparent</item>',
      );
      expect(xml).toContain('<item name="android:enforceNavigationBarContrast">false</item>');
      expect(xml).toContain(
        `<item name="android:windowLightNavigationBar">${night ? 'false' : 'true'}</item>`,
      );
    }
  });
});

describe('Reanimated writes transform and opacity straight to the views (#710)', () => {
  it('sets ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS, a flag the installed Reanimated knows', () => {
    expect(pkg.reanimated?.staticFeatureFlags?.ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS).toBe(true);
    const known = JSON.parse(
      readFileSync(
        join(packageDir('react-native-reanimated'), 'src/featureFlags/staticFlags.json'),
        'utf8',
      ),
    ) as Record<string, boolean>;
    for (const flag of Object.keys(pkg.reanimated?.staticFeatureFlags ?? {}))
      expect(Object.keys(known)).toContain(flag);
  });
});
