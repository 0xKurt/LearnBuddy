// The parts of the screen the OS paints, dressed in the palette that is showing right now
// (issue #36; themes: issue #84).
//
// Two of them:
//  - the **root view background**, which is what shows through during a screen change, a
//    rotation and while a modal is being pushed. Left alone it is white and flashes
//    against every palette.
//  - Android's **navigation bar icons**, which have to flip to light on the dark palette.
//
// The colour is read from the active palette *at the moment of the call*, never captured
// at import time — `applyPalette` replaces the token values in place (lib/theme/colors.ts)
// and `ThemeProvider` calls this right after, so a theme change pulls the system chrome
// along instead of leaving yesterday's colour behind the app.

import * as NavigationBar from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { Appearance, Platform } from 'react-native';

import { activePalette } from './colors.js';
import { isDarkBackground } from './luminance.js';
import type { Mode } from './palettes.js';
import { systemSchemeFor } from './systemScheme.js';

/** Paints the window behind the app and the navigation bar icons in the active palette. */
export function applySystemChrome(): void {
  const palette = activePalette();
  // Not fatal if the platform has no root view to colour: the app's own background still
  // covers every screen, this only removes the flash between them.
  void SystemUI.setBackgroundColorAsync(palette.bg).catch(() => undefined);
  if (Platform.OS !== 'android') return;
  // Android only. Verified on a device on 30.09. (issue #138) and it was saying the
  // opposite of what it meant:
  //
  // `barStyleFor` names the CONTENT colour, like expo-status-bar — 'light' means light
  // icons, which is what a dark bar needs. `NavigationBar.setStyle` names the BAR:
  // "'light' — a light navigation bar with dark content". Passing one into the other
  // inverted it, so the night palette asked for a light bar and got one.
  //
  // The bar is dark when the app behind it is.
  try {
    NavigationBar.setStyle(isDarkBackground(palette.bg) ? 'dark' : 'light');
  } catch {
    // An older Android or an emulator that does not honour it: the bar keeps its default.
  }
}

/**
 * Tells the OS whether the app is light or dark, so the parts it draws for us follow
 * (lib/theme/systemScheme.ts says why — above all the navigation bar under an open sheet,
 * issue #177, which lives in the sheet's own window and nothing else can reach).
 *
 * On Android this is AppCompat's night mode. The activity declares `uiMode` in its
 * `configChanges` (Expo's template), so a change reaches it as a configuration change and
 * does not recreate it — the app keeps its state.
 */
export function applySystemScheme(mode: Mode): void {
  try {
    Appearance.setColorScheme(systemSchemeFor(mode));
  } catch {
    // No native appearance module (a test runner): the OS keeps following the phone.
  }
}
