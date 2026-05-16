// LatexText — render LaTeX inline / display via react-native-katex.
// Doc 05 §components. Falls back to plain text on unsupported environments.

import { useMemo } from 'react';
import { Text } from 'react-native';
// react-native-katex ships a WebView-backed renderer; on platforms without
// WebView (jest, vitest, web SSR) it throws on import. We dynamic-require so
// the unit-test boundary is safe.
let Katex: React.ComponentType<{
  expression: string;
  displayMode?: boolean;
  style?: object;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Katex = require('react-native-katex').default ?? require('react-native-katex');
} catch {
  Katex = null;
}

import { LB } from '../../lib/theme/colors.js';

export function LatexText({
  expression,
  displayMode = false,
}: {
  expression: string;
  displayMode?: boolean;
}) {
  const fallback = useMemo(() => expression, [expression]);
  if (!Katex) {
    return (
      <Text style={{ color: LB.ink, fontStyle: 'italic', fontSize: displayMode ? 18 : 14 }}>
        {fallback}
      </Text>
    );
  }
  return (
    <Katex
      expression={expression}
      displayMode={displayMode}
      style={{ width: '100%', minHeight: displayMode ? 56 : 24 }}
    />
  );
}
