// A toast belongs to the screen it appeared on (issue #91, docs/UX-PRINCIPLES.md §24):
// a route change clears it, unless the caller explicitly said the word is for the
// screen being navigated to. The pill stands above the screen's real bottom bar.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  barHeight,
  registerToastBar,
  toast,
  toastBottom,
  toastDuration,
  useToastState,
} from '../toast.js';

beforeEach(() => {
  useToastState.setState({
    message: null,
    tone: 'info',
    seq: 0,
    survivesNavigation: false,
    action: null,
    queue: [],
    bars: {},
  });
});

describe('a toast belongs to its screen', () => {
  it('shows, then a route change clears it', () => {
    toast.show('Frage gelöscht.');
    expect(useToastState.getState().message).toBe('Frage gelöscht.');
    toast.routeChanged();
    expect(useToastState.getState().message).toBeNull();
  });

  it('a route change with nothing showing changes nothing', () => {
    const before = useToastState.getState();
    toast.routeChanged();
    expect(useToastState.getState()).toBe(before);
  });

  it('holds across route changes only when asked to, explicitly', () => {
    toast.show('Gespeichert.', 'info', { survivesNavigation: true });
    toast.routeChanged();
    // A redirect chain settles over several changes; the word still holds.
    toast.routeChanged();
    expect(useToastState.getState().message).toBe('Gespeichert.');
    toast.hide();
    expect(useToastState.getState().message).toBeNull();
  });

  it('each message keeps its own privilege, also while it waits (#133 position 10)', () => {
    toast.show('Gespeichert.', 'info', { survivesNavigation: true });
    // Waits its turn now instead of replacing the first — and it is meant for THIS screen.
    toast.show('Kopiert.');
    toast.routeChanged();
    expect(useToastState.getState().message).toBe('Gespeichert.');
    expect(useToastState.getState().queue).toHaveLength(0);
    toast.hide();
    expect(useToastState.getState().message).toBeNull();
  });

  it('a second message waits instead of replacing the first (#133 position 10)', () => {
    toast.show('Gespeichert.');
    toast.show('Foto konnte nicht hochgeladen werden.', 'error');
    expect(useToastState.getState().message).toBe('Gespeichert.');
    toast.hide();
    const s = useToastState.getState();
    expect(s.message).toBe('Foto konnte nicht hochgeladen werden.');
    expect(s.tone).toBe('error');
    toast.hide();
    expect(useToastState.getState().message).toBeNull();
  });

  it('the same text twice only restarts the timer', () => {
    toast.show('Gespeichert.');
    const first = useToastState.getState().seq;
    toast.show('Gespeichert.');
    expect(useToastState.getState().seq).toBe(first + 1);
    expect(useToastState.getState().queue).toHaveLength(0);
    toast.show('Kopiert.');
    toast.show('Kopiert.');
    expect(useToastState.getState().queue).toHaveLength(1);
  });

  it('an error is given longer to be read, an offer longer still (#133 position 10)', () => {
    expect(toastDuration('info', false)).toBe(4500);
    expect(toastDuration('error', false)).toBeGreaterThan(toastDuration('info', false));
    expect(toastDuration('info', true)).toBeGreaterThan(toastDuration('error', false));
  });

  it('taking the offer runs it once and takes the message with it (#133 position 12)', () => {
    let ran = 0;
    toast.show('Notiz gelöscht.', 'info', { action: { label: 'Rückgängig', run: () => ran++ } });
    toast.act();
    expect(ran).toBe(1);
    expect(useToastState.getState().message).toBeNull();
    expect(useToastState.getState().action).toBeNull();
    // Nothing to take any more: a second tap does nothing.
    toast.act();
    expect(ran).toBe(1);
  });

  it('dismiss clears only the message that no longer holds', () => {
    toast.show('Pause bis Montag.');
    toast.dismiss('etwas anderes');
    expect(useToastState.getState().message).toBe('Pause bis Montag.');
    toast.dismiss('Pause bis Montag.');
    expect(useToastState.getState().message).toBeNull();
  });

  it('a repeated text still bumps seq, so it announces and times anew', () => {
    toast.show('Kopiert.');
    const first = useToastState.getState().seq;
    toast.show('Kopiert.');
    expect(useToastState.getState().seq).toBe(first + 1);
  });

  it('an error keeps its tone', () => {
    toast.show('Keine Verbindung.', 'error');
    expect(useToastState.getState().tone).toBe('error');
  });
});

describe('the pill stands above the bar the screen really has', () => {
  it('tracks the tallest registered bar and forgets a removed one', () => {
    const composer = registerToastBar();
    const sendBar = registerToastBar();
    composer.set(76);
    sendBar.set(112);
    expect(barHeight(useToastState.getState().bars)).toBe(112);
    sendBar.remove();
    expect(barHeight(useToastState.getState().bars)).toBe(76);
    composer.remove();
    expect(barHeight(useToastState.getState().bars)).toBe(0);
  });

  it('re-measuring the same height changes nothing (onLayout fires often)', () => {
    const bar = registerToastBar();
    bar.set(76);
    const before = useToastState.getState();
    bar.set(76);
    expect(useToastState.getState()).toBe(before);
  });

  it('removing a bar twice is harmless (unmount races a late layout)', () => {
    const bar = registerToastBar();
    bar.set(76);
    bar.remove();
    const before = useToastState.getState();
    bar.remove();
    expect(useToastState.getState()).toBe(before);
  });

  it('sits above the bar, else above the home indicator, never behind the keyboard', () => {
    // No bar (settings, material): just over the safe area, not 90 pt into the content.
    expect(toastBottom(34, 0, 0)).toBe(34 + 16);
    // The screen's bar (composer, send bar) carries its own safe-area padding.
    expect(toastBottom(34, 96, 0)).toBe(96 + 12);
    // iOS keyboard open: the pill stays above it (audit M-80).
    expect(toastBottom(34, 96, 300)).toBe(300 + 16);
  });
});
