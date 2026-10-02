// Which light/dark the OS should draw ITS parts in (issues #177, #194).
//
// The app's palette is chosen in the app; the OS only knows light and dark. Until 02.10. it
// was told "light" for good (`userInterfaceStyle: "light"` in app.json), so everything the
// OS draws for us stayed light whatever she chose. Most visibly: an open sheet is an Android
// `Modal`, which gets its OWN window, and React Native 0.81 sets that window's navigation
// bar from the app's night mode — `Window.enableEdgeToEdge()` reads
// `UiModeUtils.isDarkMode(context)` and sets `isAppearanceLightNavigationBars = !isDarkMode`
// (ReactAndroid views/view/WindowUtil.kt). With night mode pinned to "no" that was a light,
// contrast-enforced bar under every sheet on the night palette: the white bar the owner
// measured on 01.10. (#177). `NavigationBar.setStyle` cannot reach it — it styles the
// activity's window, not the dialog's.
//
// So the app tells the OS which of the two it is showing, through React Native's
// `Appearance.setColorScheme` (AppCompat's night mode on Android, the windows'
// `overrideUserInterfaceStyle` on iOS) — and with that every system-drawn part follows:
// the sheet's navigation bar, the keyboard, alerts, pickers.
//
// Pure (no react-native): this is the decision the tests hold on to; lib/theme/systemChrome.ts
// acts on it.

import type { Mode } from './palettes.js';

/**
 * What to hand `Appearance.setColorScheme`: the chosen side, or `null` — "follow the phone"
 * — when she lets the phone decide.
 *
 * `system` MUST hand control back rather than pin today's answer. The provider reads the
 * phone's scheme through `useColorScheme()`, and an override is exactly what that hook then
 * reports: pinning "dark" while following the phone would make the app report its own
 * choice back to itself, and it would never turn light again in the morning.
 */
export function systemSchemeFor(mode: Mode): 'light' | 'dark' | null {
  return mode === 'system' ? null : mode;
}
