// In the browser the page itself is the whole window: there is no root view behind the
// app and no system navigation bar to dress, and `expo-navigation-bar` is Android-only.
// The export must still exist — `ThemeProvider` calls it on every theme change, and a
// missing export on the web once crashed a whole screen (lib/speech/recognize.web.ts).

export function applySystemChrome(): void {}

/** The browser has no system parts to dress; `prefers-color-scheme` is the user's, not ours. */
export function applySystemScheme(): void {}
