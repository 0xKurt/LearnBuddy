// Kept out of type.ts on purpose: type.ts is plain data that node-only tests import, and
// `Platform` would pull React Native's runtime into them.
import { Platform } from 'react-native';

/**
 * The one monospace face (issue #262): a program is read by its columns — the indentation IS the
 * structure in Python — so it needs equal-width letters. The system's own on every platform, no
 * font to download.
 */
export const MONO: string =
  Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  }) ?? 'monospace';
