// The frame a component gets in the app, for a component test (docs/testing-layers.md).
//
// Same providers as app/_layout.tsx, same order: the palette, the screen's safe area, the
// query client. German texts come from the real locale files — a test asserts the sentence
// the learner reads, not a key.

import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ThemeProvider } from '../lib/theme/ThemeProvider.js';
// Imported for its side effect: this is where i18next is initialised with locales/**.
import '../lib/i18n/index.js';

/** A phone's insets, so a pinned bar gets the room it has on a real screen. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Providers({ children }: { children: ReactNode }) {
  // One client per render, so nothing a test did reaches the next one.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export function renderInApp(ui: ReactElement): RenderResult {
  return render(ui, { wrapper: Providers });
}

/**
 * The style the browser ends up applying to this element. react-native-web turns a style
 * object into inline CSS and atomic classes; this reads what came out of both, which is
 * what the walkthrough's Chromium would read too.
 *
 * It is a *declared* value, never a measured one: jsdom lays nothing out, so widths,
 * positions and overflow are all zero here. Those belong to tests/web (fit.ts).
 */
export function styleOf(el: Element): CSSStyleDeclaration {
  return getComputedStyle(el);
}

/**
 * The closest element that contains both — the box whose flex direction decides whether
 * these two sit side by side or one under the other.
 */
export function commonBox(a: Element, b: Element): Element {
  for (let up: Element | null = a; up; up = up.parentElement) {
    if (up.contains(b)) return up;
  }
  throw new Error('the two elements are not in one tree');
}
