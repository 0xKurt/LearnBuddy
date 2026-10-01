// Die Lernfläche, mit der sie wirklich arbeitet (issue #162). Was hier festgehalten wird,
// ist genau das, was zwischen „ein Bild" und „etwas, womit sie arbeiten kann" liegt:
//
//   · jedes Teil des Balkens ist ein echter Button mit Namen — bedienbar auch ohne Augen;
//   · ein Tipp schreibt den Bruch ins ANTWORTFELD, also bleibt Tippen daneben erreichbar
//     (Abnahmekriterium von #162) und „Prüfen" ist weiter der eine Weg zum Urteil;
//   · ein getipptes gleichwertiges `1/2` färbt zwei von vier Teilen — sie SIEHT, dass das
//     dasselbe ist;
//   · wie viel gefärbt ist, steht in Worten da: Farbe ist nie das einzige Signal.
//
// Was diese Schicht nicht sehen kann: Geometrie. Dass ein Teil 49 pt breit ist, misst der
// Browser (tests/web/fit.ts) — hier steht die Regel, von der diese Messung abhängt.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp, styleOf } from '../../../testing/render.js';
import { FractionBarAnswer, shadedFromText, shadedText } from '../FractionBarAnswer.js';

const noop = () => undefined;

describe('a bar she shades', () => {
  it('offers one named button per part, so it is operable without looking', () => {
    renderInApp(
      <FractionBarAnswer
        surface={{ mode: 'shade', parts: 4 }}
        value=""
        disabled={false}
        onChange={noop}
        onPick={noop}
      />,
    );
    const parts = screen.getAllByRole('button');
    expect(parts).toHaveLength(4);
    expect(parts.map((p) => p.getAttribute('aria-label'))).toEqual([
      'Teil 1 von 4',
      'Teil 2 von 4',
      'Teil 3 von 4',
      'Teil 4 von 4',
    ]);
    // A button may not carry aria-selected (it is not allowed on this role, and axe fails
    // the whole screen for it). The amount is said in words instead, right under the bar.
    expect(parts.some((p) => p.hasAttribute('aria-selected'))).toBe(false);
    expect(screen.getByText('0 von 4 Teilen gefärbt')).toBeDefined();
  });

  it('writes what is shaded into the answer field, so "Prüfen" and typing stay the way in', () => {
    const onChange = vi.fn();
    renderInApp(
      <FractionBarAnswer
        surface={{ mode: 'shade', parts: 4 }}
        value=""
        disabled={false}
        onChange={onChange}
        onPick={noop}
      />,
    );
    // Tapping the third part fills the bar up to it: a fraction is an amount, not a set of
    // scattered parts.
    fireEvent.click(screen.getByRole('button', { name: 'Teil 3 von 4' }));
    expect(onChange).toHaveBeenCalledWith('3/4');
  });

  it('gives a part back when she taps the last one that is shaded, down to nothing', () => {
    const onChange = vi.fn();
    const bar = (value: string) => (
      <FractionBarAnswer
        surface={{ mode: 'shade', parts: 4 }}
        value={value}
        disabled={false}
        onChange={onChange}
        onPick={noop}
      />
    );
    const { rerender } = renderInApp(bar('2/4'));
    fireEvent.click(screen.getByRole('button', { name: 'Teil 2 von 4' }));
    expect(onChange).toHaveBeenLastCalledWith('1/4');
    rerender(bar('1/4'));
    fireEvent.click(screen.getByRole('button', { name: 'Teil 1 von 4' }));
    expect(onChange).toHaveBeenLastCalledWith('0/4');
  });

  it('shows a typed equivalent amount on the bar — 1/2 is two of four', () => {
    renderInApp(
      <FractionBarAnswer
        surface={{ mode: 'shade', parts: 4 }}
        value="1/2"
        disabled={false}
        onChange={noop}
        onPick={noop}
      />,
    );
    expect(screen.getByText('2 von 4 Teilen gefärbt')).toBeDefined();
  });

  // CLAUDE.md rule 13, and the one the owner's memory calls CRITICAL: a background declared
  // on a `Pressable` silently does not paint on React Native 0.73+. On the web it looks
  // perfect, which is exactly how it reaches a phone — so the rule is pinned here.
  it('paints a shaded part on the inner View, never on the Pressable', () => {
    renderInApp(
      <FractionBarAnswer
        surface={{ mode: 'shade', parts: 4 }}
        value="2/4"
        disabled={false}
        onChange={noop}
        onPick={noop}
      />,
    );
    const shadedPart = screen.getByRole('button', { name: 'Teil 1 von 4' });
    expect(styleOf(shadedPart).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    const inner = shadedPart.firstElementChild;
    expect(inner, 'a part needs an inner View to paint').not.toBeNull();
    expect(styleOf(inner as Element).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  it('does nothing while an answer is on its way', () => {
    const onChange = vi.fn();
    renderInApp(
      <FractionBarAnswer
        surface={{ mode: 'shade', parts: 4 }}
        value=""
        disabled
        onChange={onChange}
        onPick={noop}
      />,
    );
    const first = screen.getByRole('button', { name: 'Teil 1 von 4' });
    expect((first as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(first);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('two bars she compares', () => {
  const surface = {
    mode: 'pick' as const,
    bars: [
      { parts: 2, filled: 1 },
      { parts: 5, filled: 3 },
    ],
  };

  it('is two named buttons, and each says which amount it is', () => {
    renderInApp(
      <FractionBarAnswer
        surface={surface}
        value=""
        disabled={false}
        onChange={noop}
        onPick={noop}
      />,
    );
    const bars = screen.getAllByRole('button');
    expect(bars).toHaveLength(2);
    // Each amount is NAMED, in words a screen reader can read — not "Button 2".
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
      'ein Halb wählen',
      '3 Fünftel wählen',
    ]);
    // And both amounts stand there to be read, not only to be heard.
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
  });

  it('answers with the amount of the bar she tapped', () => {
    const onPick = vi.fn();
    renderInApp(
      <FractionBarAnswer
        surface={surface}
        value=""
        disabled={false}
        onChange={noop}
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getAllByRole('button')[1]!);
    expect(onPick).toHaveBeenCalledWith('3/5');
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(onPick).toHaveBeenLastCalledWith('1/2');
  });
});

describe('reading the answer field back onto the bar', () => {
  it('counts a fraction however it is written, and leaves the bar alone otherwise', () => {
    expect(shadedFromText('', 4)).toBe(0);
    expect(shadedFromText('3/4', 4)).toBe(3);
    expect(shadedFromText('1/2', 4)).toBe(2);
    expect(shadedFromText('2 / 4', 4)).toBe(2);
    expect(shadedFromText('0', 4)).toBe(0);
    expect(shadedFromText('1', 4)).toBe(4);
    // Not a whole number of parts, or past the bar: guessing at what she meant would be
    // the app pretending she tapped something she did not.
    expect(shadedFromText('1/3', 4)).toBeNull();
    expect(shadedFromText('0,5', 4)).toBeNull();
    expect(shadedFromText('5/4', 4)).toBeNull();
    expect(shadedFromText('2/0', 4)).toBeNull();
    expect(shadedFromText('die Hälfte', 4)).toBeNull();
  });

  it('writes the answer exactly as a key is written', () => {
    expect(shadedText(2, 4)).toBe('2/4');
    expect(shadedText(0, 6)).toBe('0/6');
  });
});
