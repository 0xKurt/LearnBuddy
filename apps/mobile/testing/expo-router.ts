// A stand-in for expo-router, for the component project.
//
// requires live verification in Claude Code session — this replaces part of the outside
// world (CLAUDE.md rule 8). expo-router ships JSX inside `.js` files, because Metro
// transforms node_modules and Node does not: `require('expo-router')` fails on the first
// `<`. Navigation is also not a component's own job — where a tap leads is a screen
// question, and the browser walkthrough (tests/web) is what actually walks it.
//
// Only what `components/**` and `lib/**` import is here. A component test that wants to
// prove where a tap leads reads `router.pushed` instead of guessing.

import { useEffect } from 'react';

type Target = string | { pathname: string; params?: Record<string, string> };

export type Href = Target;

/** Where the app asked to go, newest last; a test may read and clear it. */
export const router = {
  pushed: [] as Target[],
  push(href: Target): void {
    router.pushed.push(href);
  },
  replace(href: Target): void {
    router.pushed.push(href);
  },
  navigate(href: Target): void {
    router.pushed.push(href);
  },
  back(): void {
    router.pushed.push('..');
  },
  canGoBack(): boolean {
    return router.pushed.length > 0;
  },
  setParams(): void {},
  dismissAll(): void {},
  reset(): void {
    router.pushed.length = 0;
  },
};

/** The route a component thinks it is on. Nothing navigates here, so it is the root. */
export function usePathname(): string {
  return '/';
}

/** Outside a navigator a screen is simply always focused. */
export function useFocusEffect(effect: () => void | (() => void)): void {
  useEffect(effect, [effect]);
}
