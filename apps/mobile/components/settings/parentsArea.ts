// What of the parents' area is open right now (docs/privacy.md §PIN gate, lib/parentsGate.ts).
// The settings ask the parents' PIN and then open the page; the page shows only what was
// approved, for the account and profile it was approved for, and nothing without it — a link
// straight to it finds the area closed. Held outside the component tree because two routes share
// it: the settings open it, the page reads it. It closes when the page leaves the screen for
// anything but the PIN pad, when the page is taken off the stack by whatever means (its unmount:
// the way back, a sign-out's `replace`, a notification's `dismissAll`), and when the app goes to
// the background. Never stored: closing the app closes it.

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import type { ParentsView } from '../../lib/parentsGate.js';

type ParentsArea = {
  view: ParentsView | null;
  /** The account and profile the parents opened it for. */
  owner: string | null;
  open: (view: ParentsView, owner: string) => void;
  close: () => void;
};

export const useParentsArea = create<ParentsArea>((set) => ({
  view: null,
  owner: null,
  open: (view, owner) => set({ view, owner }),
  close: () => set({ view: null, owner: null }),
}));

/** Who an approval belongs to: another account or profile on this phone never inherits it. */
export const parentsOwner = (accountId: string, learnerId: string) => `${accountId}:${learnerId}`;

/** The page itself, and the PIN screen a step in it opens over it. */
const STAYS_OPEN = ['/settings/parents', '/pin'];

/**
 * What the parents' page may show for `owner` — null while it is closed. The page calls this
 * once; it is also what closes the area again (see above).
 */
export function useOpenParentsArea(owner: string | null, pathname: string): ParentsView | null {
  const area = useParentsArea();
  useEffect(() => {
    if (!STAYS_OPEN.includes(pathname)) useParentsArea.getState().close();
  }, [pathname]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') useParentsArea.getState().close();
    });
    return () => {
      sub.remove();
      useParentsArea.getState().close();
    };
  }, []);
  return owner !== null && area.owner === owner ? area.view : null;
}
