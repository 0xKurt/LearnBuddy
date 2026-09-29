// A toast belongs to the screen it appeared on (issue #91, docs/UX-PRINCIPLES.md §24):
// a route change clears it, unless the caller explicitly said the word is for the
// screen being navigated to. The pill stands above the screen's real bottom bar.

import { beforeEach, describe, expect, it } from 'vitest';

import { barHeight, registerToastBar, toast, toastBottom, useToastState } from '../toast.js';

beforeEach(() => {
  useToastState.setState({
    message: null,
    tone: 'info',
    seq: 0,
    survivesNavigation: false,
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

  it('the next plain message drops the privilege', () => {
    toast.show('Gespeichert.', 'info', { survivesNavigation: true });
    toast.show('Kopiert.');
    toast.routeChanged();
    expect(useToastState.getState().message).toBeNull();
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
