// The one short message at the bottom (errors, confirmations): its state and the
// rules around it, free of React Native so the behaviour is testable (issue #91).
//
// A message belongs to the screen it appeared on — a route change clears it, so
// "Frage gelöscht." never floats over the settings (docs/UX-PRINCIPLES.md §24).
// The one exception is explicit: show(…, { survivesNavigation: true }) for a word
// that is meant for the screen being navigated to (saved-and-back, session over) —
// and never for an error, which always dies with its own screen (issue #183).
// Bottom bars (Composer, BottomBar, SendBar) register their measured height here,
// so the pill stands above the bar the screen really has instead of a guessed 90 pt.

import { create } from 'zustand';

import { SPACE } from './theme/space.js';

export type ToastTone = 'info' | 'error';

/** The one thing a message may offer to do — "Rückgängig", never a second sentence. */
export type ToastAction = {
  label: string;
  run: () => void;
};

export type ToastOptions = {
  /**
   * The message is meant for the screen being navigated to (a confirmation shown
   * while going back, "session over" on the way to the start screen): route changes
   * do not clear it — only its timer or the next message do. Never the default; a
   * toast dies with its screen (issue #91).
   *
   * Only a confirmation can be meant for the next screen. An error is ignored here and
   * dies with the screen that raised it — see show() (issue #183).
   */
  survivesNavigation?: boolean;
  /**
   * One offer next to the text, for the few places where the server can really take
   * the action back (issue #133 position 12). Tapping it runs `run` and hides the
   * message; the offer disappears with the message, so it never promises after the
   * moment has passed.
   */
  action?: ToastAction;
};

/**
 * How long a message stands. An error is read, not glanced at — and it usually names
 * a next step, so it gets the time to be read twice (#133 position 10). A message
 * with an offer waits longer still: it is asking a question.
 */
export function toastDuration(tone: ToastTone, hasAction: boolean): number {
  if (hasAction) return 9000;
  return tone === 'error' ? 7000 : 4500;
}

type Entry = {
  message: string;
  tone: ToastTone;
  survivesNavigation: boolean;
  action: ToastAction | null;
};

type ToastState = {
  message: string | null;
  tone: ToastTone;
  /** Bumped per show(): re-announces and restarts the timer for a repeated text. */
  seq: number;
  survivesNavigation: boolean;
  action: ToastAction | null;
  /**
   * What is still to be said. Two things happening at once (a save confirmed while an
   * upload fails) used to mean the first was replaced before it could be read — now it
   * waits its turn (#133 position 10). A repeat of the text already showing is not
   * queued: it only restarts the timer.
   */
  queue: Entry[];
  /** Height of each bottom bar on screen (id → pt), safe-area padding included. */
  bars: Record<number, number>;
};

export const useToastState = create<ToastState>(() => ({
  message: null,
  tone: 'info',
  seq: 0,
  survivesNavigation: false,
  action: null,
  queue: [],
  bars: {},
}));

const clear = { message: null, survivesNavigation: false, action: null } as const;

/** Show the next queued message, or nothing if the queue ran dry. */
function advance(s: ToastState): Partial<ToastState> {
  const [next, ...rest] = s.queue;
  if (!next) return { ...clear, queue: [] };
  return { ...next, seq: s.seq + 1, queue: rest };
}

export const toast = {
  show(message: string, tone: ToastTone = 'info', options: ToastOptions = {}): void {
    const entry: Entry = {
      message,
      tone,
      // An error belongs to the screen that raised it, and only there. On the next screen it
      // explains nothing, it covers that screen's controls, and it reads as if the screen she
      // just opened were broken — a child saw exactly that, a red message standing over the
      // menu and the pronunciation sheet (issue #183). So the flag is a confirmation's to
      // ask for; for an error it is ignored, in code, not in review.
      survivesNavigation: tone !== 'error' && options.survivesNavigation === true,
      action: options.action ?? null,
    };
    useToastState.setState((s) => {
      // Nothing showing, or the same text again: straight to the front.
      if (s.message === null || s.message === message) return { ...entry, seq: s.seq + 1 };
      // Already waiting with the same text: leave the queue as it is.
      if (s.queue.some((q) => q.message === message)) return s;
      return { queue: [...s.queue, entry] };
    });
  },
  hide(): void {
    useToastState.setState(advance);
  },
  /** Hides this message if it is the one showing (it no longer holds), leaves any other. */
  dismiss(message: string): void {
    useToastState.setState((s) =>
      s.message === message ? advance(s) : { queue: s.queue.filter((q) => q.message !== message) },
    );
  },
  /** The message's offer was taken: run it, and take the message with it. */
  act(): void {
    const run = useToastState.getState().action?.run;
    useToastState.setState(advance);
    run?.();
  },
  /** The route changed: a message that belonged to the screen before goes with it. */
  routeChanged(): void {
    useToastState.setState((s) => {
      // What waits goes with the screen too, unless it was meant for the next one.
      const queue = s.queue.filter((q) => q.survivesNavigation);
      const goes = s.message !== null && !s.survivesNavigation;
      if (goes) return advance({ ...s, queue });
      return queue.length === s.queue.length ? s : { queue };
    });
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
