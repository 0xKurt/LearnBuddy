// The app's sans-serif inside SVG too (the web would otherwise fall back to a serif). One place,
// because every drawing — FigureView, the note line, the pictures of issues #254/#255 — uses it.

import { Platform } from 'react-native';

export const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});
