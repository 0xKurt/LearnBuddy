// The one short message at the bottom (errors, confirmations): its state and the
// rules around it, free of React Native so the behaviour is testable (issue #91).
//
// A message belongs to the screen it appeared on — a route change clears it, so
// "Frage gelöscht." never floats over the settings (docs/UX-PRINCIPLES.md §24).
// The one exception is explicit: show(…, { survivesNavigation: true }) for a word
// that is meant for the screen being navigated to (saved-and-back, session over).
// Bottom bars (Composer, BottomBar, SendBar) register their measured height here,
// so the pill stands above the bar the screen really has instead of a guessed 90 pt.

import { create } from 'zustand';

import { SPACE } from './theme/space.js';

export type ToastTone = 'info' | 'error';

export type ToastOptions = {
  /**
   * The message is meant for the screen being navigated to (a confirmation shown
   * while going back, "session over" on the way to the start screen): route changes
   * do not clear it — only its timer or the next message do. Never the default; a
   * toast dies with its screen (issue #91).
   */
  survivesNavigation?: boolean;
};

type ToastState = {
  message: string | null;
  tone: ToastTone;
  /** Bumped per show(): re-announces and restarts the timer for a repeated text. */
  seq: number;
  survivesNavigation: boolean;
  /** Height of each bottom bar on screen (id → pt), safe-area padding included. */
  bars: Record<number, number>;
};

export const useToastState = create<ToastState>(() => ({
  message: null,
  tone: 'info',
  seq: 0,
  survivesNavigation: false,
  bars: {},
}));

export const toast = {
  show(message: string, tone: ToastTone = 'info', options: ToastOptions = {}): void {
    useToastState.setState((s) => ({
      message,
      tone,
      seq: s.seq + 1,
      survivesNavigation: options.survivesNavigation === true,
    }));
  },
  hide(): void {
    useToastState.setState({ message: null, survivesNavigation: false });
  },
  /** Hides this message if it is the one showing (it no longer holds), leaves any other. */
  dismiss(message: string): void {
    useToastState.setState((s) =>
      s.message === message ? { message: null, survivesNavigation: false } : s,
    );
  },
  /** The route changed: a message that belonged to the screen before goes with it. */
  routeChanged(): void {
    useToastState.setState((s) =>
      s.message !== null && !s.survivesNavigation ? { message: null } : s,
    );
  },
};

let nextBarId = 1;

export type ToastBarHandle = {
  /** The bar's measured height (its own safe-area padding included). */
  set: (height: number) => void;
  /** The bar left the screen. */
  remove: () => void;
};

/** A bottom bar announces itself so the message stands above it, not on it. */
export function registerToastBar(): ToastBarHandle {
  const id = nextBarId++;
  return {
    set(height) {
      useToastState.setState((s) =>
        s.bars[id] === height ? s : { bars: { ...s.bars, [id]: height } },
      );
    },
    remove() {
      useToastState.setState((s) => {
        if (!(id in s.bars)) return s;
        const bars = { ...s.bars };
        delete bars[id];
        return { bars };
      });
    },
  };
}

/** The tallest bar on screen — two can overlap for a moment while screens change. */
export function barHeight(bars: Record<number, number>): number {
  let max = 0;
  for (const h of Object.values(bars)) if (h > max) max = h;
  return max;
}

/**
 * Where the pill's bottom edge sits: above the screen's real bottom bar if there is
 * one, above the home indicator otherwise — and never behind the iOS keyboard (M-80).
 */
export function toastBottom(safeBottom: number, bar: number, keyboard: number): number {
  const above = bar > 0 ? bar + SPACE.md : safeBottom + SPACE.lg;
  return Math.max(above, keyboard + SPACE.lg);
}
