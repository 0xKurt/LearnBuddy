// The one component every CTA in the app goes through (CLAUDE.md rule 13), so every
// regression in it is a regression everywhere. Three things are pinned here, each of them
// a bug that reached the owner's phone:
//
//   · its own cross-axis alignment, which overrides the row it is put in (issue #187)
//   · a waiting button that answers a tap instead of swallowing it (issue #97)
//   · the colours it paints with after the palette changed under it (issue #84)
//
// What this layer cannot see: where the button actually ends up on screen. jsdom lays
// nothing out. "Senden stood 8 pt above its neighbours" is a measurement and belongs to
// tests/web — this file holds the declared rule those measurements depend on.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { Btn } from '../Btn.js';

describe('a Btn decides its own alignment (issue #187)', () => {
  // The composer bar says `alignItems: 'flex-end'` so its controls sit on the field's last
  // line. `Btn` sets `alignSelf` on itself, and alignSelf beats a parent's alignItems — so
  // the moment the field grew to two lines, "Senden" stayed at the top of the row, 8 pt
  // above its neighbours. Nothing in any suite could see it, because nothing asked.
  //
  // The rule stands (a button in a column should not stretch across it), which makes it a
  // trap worth stating: a row that wants its buttons flush has to say `full`, `center` or
  // `grow`. These three assertions are that contract. If the default ever changes, every
  // non-full button in the app moves, and this fails.
  it('pins itself to the start of its parent unless told otherwise', () => {
    renderInApp(<Btn onPress={() => undefined}>Senden</Btn>);
    expect(styleOf(screen.getByRole('button', { name: 'Senden' })).alignSelf).toBe('flex-start');
  });

  it('stretches across its parent when `full` is set — what a pinned CTA needs', () => {
    renderInApp(
      <Btn full onPress={() => undefined}>
        Weiter
      </Btn>,
    );
    expect(styleOf(screen.getByRole('button', { name: 'Weiter' })).alignSelf).toBe('stretch');
  });

  it('centres itself when `center` is set', () => {
    renderInApp(
      <Btn center onPress={() => undefined}>
        Überspringen
      </Btn>,
    );
    expect(styleOf(screen.getByRole('button', { name: 'Überspringen' })).alignSelf).toBe('center');
  });
});

describe('a waiting button says why instead of swallowing the tap (issue #97)', () => {
  it('answers a tap on the disabled button without doing its job', () => {
    const onPress = vi.fn();
    const onDisabledPress = vi.fn();
    renderInApp(
      <Btn disabled onPress={onPress} onDisabledPress={onDisabledPress}>
        Antwort prüfen
      </Btn>,
    );
    const button = screen.getByRole('button', { name: 'Antwort prüfen' });
    // Assistive tech must still hear "deaktiviert": un-disabling it to catch the tap made
    // the web read as ready, which is the mistake #97 warns about.
    expect((button as HTMLButtonElement).disabled).toBe(true);

    // The tap lands on the invisible catcher laid over the button. It is the only other
    // pressable in the group, and it is deliberately hidden from assistive tech, so it is
    // found by position rather than by role.
    const group = button.parentElement;
    expect(group).not.toBeNull();
    const catcher = Array.from(group?.children ?? []).find((c) => c !== button);
    expect(catcher, 'a waiting button with onDisabledPress needs its tap catcher').toBeDefined();
    if (catcher) fireEvent.click(catcher);

    expect(onDisabledPress).toHaveBeenCalledTimes(1);
    expect(onPress, 'the button must not do its job while it waits').not.toHaveBeenCalled();
  });

  it('does nothing twice while its work is in flight', () => {
    const onPress = vi.fn();
    renderInApp(
      <Btn busy onPress={onPress}>
        Senden
      </Btn>,
    );
    const button = screen.getByRole('button', { name: 'Senden' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onPress, 'a busy button must not send a second time').not.toHaveBeenCalled();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    // It keeps its label and visibly waits instead of going blank — she can still read
    // what she pressed while it runs.
    expect(button.textContent).toContain('Senden');
    expect(styleOf(button).opacity).toBe('0.8');
  });
});

describe('a palette change repaints the button (issue #84)', () => {
  // The ghost "Rückgängig" kept pastel ink on the night cards because the variant skins were
  // a module-scope constant: built once, from whichever palette happened to start the app.
  // lib/theme/__tests__/frozen-colors.test.ts scans the source for that shape; this switches
  // the palette for real and reads the colour that came out.
  //
  // Verified by re-introducing #84 in Btn.tsx (a frozen `variantStyle(paletteOf('pastell'))`):
  // this test fails, the other five stay green.
  //
  // It does NOT cover #171. That bug is React Native's native diffing — a component passing
  // a live token object straight through (`style={TYPE.title}`) keeps the object's identity,
  // so the native view is never updated even though the values changed. Removing
  // `key={name}` from ThemeProvider leaves this test green: react-native-web rebuilds CSS
  // from the object's current values on every render, so the web cannot reproduce it.
  // #171 stays a device finding (.maestro) plus the source guard in frozen-colors.test.ts.
  function Switcher() {
    const { choose } = useTheme();
    return (
      <>
        <Btn onPress={() => undefined}>Weiter</Btn>
        <Btn variant="ghost" onPress={() => choose({ mode: 'dark' })}>
          Nacht
        </Btn>
      </>
    );
  }

  it('paints the night palette after the switch, not the one it started in', () => {
    renderInApp(<Switcher />);
    const light = paletteOf('pastell');
    const night = paletteOf('pastellDark');
    expect(light.primary, 'the two palettes must differ for this to prove anything').not.toBe(
      night.primary,
    );

    // The fill sits on the inner View, never on the Pressable (CLAUDE.md rule 13), so the
    // colour is read off the box inside the button.
    const fillOf = (name: string): string => {
      const button = screen.getByRole('button', { name });
      const inner = button.firstElementChild;
      expect(inner, 'a Btn paints its inner View, not the Pressable').not.toBeNull();
      return styleOf(inner as Element).backgroundColor;
    };

    const before = fillOf('Weiter');
    fireEvent.click(screen.getByRole('button', { name: 'Nacht' }));
    const after = fillOf('Weiter');

    expect(before).not.toBe(after);
    expect(after).toBe(asRgb(night.primary));
  });
});

/** jsdom reports colours as `rgb(r, g, b)`; the palette holds hex. */
function asRgb(hex: string): string {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = Number.parseInt(full, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe('the icon-only Btn is small to the eye and 44 to the finger (issue #295)', () => {
  it('shows no text, is named by its label and keeps a 44 pt target', () => {
    const onPress = vi.fn();
    renderInApp(
      <Btn iconOnly icon="undo" onPress={onPress} accessibilityLabel="Rückgängig: Eingetragen">
        Rückgängig
      </Btn>,
    );
    const button = screen.getByRole('button', { name: 'Rückgängig: Eingetragen' });
    expect(button.textContent).toBe('');
    expect(styleOf(button).width).toBe('44px');
    expect(styleOf(button).height).toBe('44px');
    // The 20 pt beyond the 24 pt circle come back as a negative margin: the row it sits in
    // lays out the circle, the finger gets the whole 44.
    expect(styleOf(button).marginTop).toBe('-10px');
    expect(styleOf(button).marginLeft).toBe('-10px');
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('turns into a spinner in the same place while busy, and does not fire twice', () => {
    const onPress = vi.fn();
    renderInApp(
      <Btn iconOnly icon="undo" busy onPress={onPress}>
        Rückgängig
      </Btn>,
    );
    const button = screen.getByRole('button', { name: 'Rückgängig' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('[role="progressbar"]')).not.toBeNull();
    // The arrow itself is gone while the spinner stands in its place.
    expect(button.querySelector('path[d^="M4.5 4.5"]')).toBeNull();
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('draws its icon in the secondary ink, and steps back to the placeholder tone when waiting', () => {
    const p = paletteOf('pastell');
    const strokeOf = (el: Element) => el.querySelector('path')?.getAttribute('stroke');
    const { unmount } = renderInApp(
      <Btn iconOnly icon="undo" onPress={() => undefined}>
        Rückgängig
      </Btn>,
    );
    expect(strokeOf(screen.getByRole('button', { name: 'Rückgängig' }))).toBe(p.ink2);
    unmount();
    renderInApp(
      <Btn iconOnly icon="undo" disabled onPress={() => undefined}>
        Rückgängig
      </Btn>,
    );
    expect(strokeOf(screen.getByRole('button', { name: 'Rückgängig' }))).toBe(p.placeholder);
  });
});
