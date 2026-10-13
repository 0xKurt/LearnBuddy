// The one Composer (issue #599, owner rule 7; design components/composer/Composer.jsx): one box,
// one primary slot whose content changes — voice → send → check → next — and nothing else moves.
// Where it stands on a phone and what it costs is the walkthrough's (tests/web/fit.ts).

import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import type { VoiceInput } from '../../voice/useVoiceInput.js';
import { Btn } from '../Btn.js';
import { Composer, type ComposerAction } from '../Composer.js';

vi.mock('../../voice/MicButton.js', () => ({ MicButton: () => null, MicStatus: () => null }));

const light = paletteOf('pastell');

function css(property: 'backgroundColor' | 'borderTopColor', color: string): string {
  const element = document.createElement('div');
  element.style[property] = color;
  return element.style[property];
}

/** The painted face of a control: the Pressable carries the 44 pt target, its child the look. */
function face(control: HTMLElement): HTMLElement {
  const inner = control.firstElementChild;
  if (!(inner instanceof HTMLElement)) throw new Error('Expected a painted face');
  return inner;
}

const slot = () => screen.getByTestId('composer-primary');

it('holds the blue conversation button in the primary slot until there is something to send', () => {
  const sent = vi.fn();
  const talk = vi.fn();
  function Chat() {
    const [value, setValue] = useState('');
    return (
      <Composer
        value={value}
        maxLength={100}
        onChangeText={setValue}
        accessibilityLabel="Nachricht"
        action={value.trim() ? { kind: 'send', onPress: () => sent(value) } : null}
        onTalk={talk}
      />
    );
  }
  renderInApp(<Chat />);
  const wave = screen.getByRole('button', { name: 'Mit Buddy sprechen' });
  expect(slot().contains(wave)).toBe(true);
  // Blue, never a grey circle among the tools on the left.
  expect(styleOf(face(wave)).backgroundColor).toBe(css('backgroundColor', light.primary));
  expect(styleOf(face(wave)).width).toBe('40px');
  fireEvent.click(wave);
  expect(talk).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByRole('textbox', { name: 'Nachricht' }), {
    target: { value: 'Hilf mir bitte' },
  });
  expect(screen.queryByRole('button', { name: 'Mit Buddy sprechen' })).toBeNull();
  const send = screen.getByRole('button', { name: 'Senden' });
  expect(slot().contains(send)).toBe(true);
  expect(slot().querySelectorAll('[role="button"]')).toHaveLength(1);
  fireEvent.click(send);
  expect(sent).toHaveBeenCalledWith('Hilf mir bitte');
});

it.each([
  ['Prüfen', { kind: 'check', ready: true, onPress: vi.fn() }],
  ['Weiter', { kind: 'next', onPress: vi.fn() }],
] as Array<[string, ComposerAction]>)(
  'draws "%s" as a 40 pt pill with its sign, in the primary slot',
  (name, action) => {
    renderInApp(<Composer value="" maxLength={100} accessibilityLabel="Frage" action={action} />);
    const pill = screen.getByRole('button', { name });
    expect(slot().contains(pill)).toBe(true);
    const painted = face(pill);
    expect(styleOf(painted).height).toBe('40px');
    expect(styleOf(pill).minHeight).toBe('44px');
    expect(styleOf(painted).backgroundColor).toBe(css('backgroundColor', light.primary));
    // The word, then its sign (Composer.jsx:69) — drawn at the bold stroke.
    expect(painted.textContent).toBe(name);
    expect(painted.querySelector('svg path')?.getAttribute('stroke-width')).toBe('2.2');
    expect(painted.lastElementChild?.tagName.toLowerCase()).toBe('svg');
    fireEvent.click(pill);
    expect('onPress' in action && action.onPress).toHaveBeenCalledOnce();
  },
);

it('lets a check that waits stay a quiet pill in its place, saying why', () => {
  const press = vi.fn();
  renderInApp(
    <Composer
      value=""
      maxLength={100}
      accessibilityLabel="Frage"
      action={{ kind: 'check', ready: false, onPress: press, waitsHint: 'Wähl erst eine Antwort.' }}
    />,
  );
  const pill = screen.getByRole('button', { name: 'Prüfen' });
  expect(slot().contains(pill)).toBe(true);
  expect(pill.getAttribute('aria-disabled')).toBe('true');
  const painted = face(pill);
  // Canvas, a hairline, quiet ink: still the pill, never a grey bar across.
  expect(styleOf(painted).backgroundColor).toBe(css('backgroundColor', light.canvas));
  expect(styleOf(painted).borderTopColor).toBe(css('borderTopColor', light.hairlineStrong));
  expect(styleOf(painted).height).toBe('40px');
  expect(painted.querySelector('svg')).not.toBeNull();
  fireEvent.click(pill);
  expect(press).not.toHaveBeenCalled();
});

it('sends and checks nothing while the mic listens: the slot is the conversation’s', () => {
  const voice = { state: 'recording' } as VoiceInput;
  renderInApp(
    <Composer
      value="Entwurf"
      maxLength={100}
      accessibilityLabel="Nachricht"
      voice={voice}
      action={{ kind: 'send', onPress: vi.fn() }}
      onTalk={vi.fn()}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Senden' })).toBeNull();
  expect(slot().contains(screen.getByRole('button', { name: 'Mit Buddy sprechen' }))).toBe(true);
});

it('hosts what the design does not draw in the same slot ("Stopp", "Umdrehen")', () => {
  renderInApp(
    <Composer
      value=""
      maxLength={100}
      accessibilityLabel="Nachricht"
      action={{ kind: 'own', node: <Btn>Umdrehen</Btn> }}
      onTalk={vi.fn()}
    />,
  );
  expect(slot().contains(screen.getByRole('button', { name: 'Umdrehen' }))).toBe(true);
  expect(screen.queryByRole('button', { name: 'Mit Buddy sprechen' })).toBeNull();
});

it('keeps its keys inside the box, shown and hidden by the mode chip', () => {
  function Formula() {
    const [on, setOn] = useState(true);
    return (
      <Composer
        value="3"
        maxLength={100}
        accessibilityLabel="Antwort"
        keys={<Btn>x²</Btn>}
        mode={{ label: 'Formel', on, onPress: () => setOn(!on) }}
        action={{ kind: 'check', ready: true, onPress: vi.fn() }}
      />
    );
  }
  renderInApp(<Formula />);
  const input = screen.getByRole('textbox', { name: 'Antwort' });
  const box = input.parentElement?.parentElement;
  expect(box?.contains(screen.getByRole('button', { name: 'x²' }))).toBe(true);
  expect(box?.contains(screen.getByRole('button', { name: 'Prüfen' }))).toBe(true);
  const chip = screen.getByRole('button', { name: 'Formel' });
  expect(box?.contains(chip)).toBe(true);
  expect(chip.getAttribute('aria-expanded')).toBe('true');
  expect(styleOf(face(chip)).height).toBe('32px');
  expect(styleOf(face(chip)).backgroundColor).toBe(css('backgroundColor', light.primaryLt));
  fireEvent.click(chip);
  expect(screen.queryByRole('button', { name: 'x²' })).toBeNull();
  expect(chip.getAttribute('aria-expanded')).toBe('false');
  expect(styleOf(face(chip)).backgroundColor).toBe(css('backgroundColor', light.canvas));
});

it('draws the box with a hairline that does not change with the focus', () => {
  renderInApp(<Composer value="" maxLength={100} accessibilityLabel="Nachricht" />);
  const input = screen.getByRole('textbox', { name: 'Nachricht' });
  const box = input.parentElement!.parentElement!;
  const hairline = css('borderTopColor', light.hairlineStrong);
  expect(styleOf(box).borderTopColor).toBe(hairline);
  expect(styleOf(box).borderTopLeftRadius).toBe('26px');
  expect(styleOf(box).outlineWidth).toBe('0px');
  fireEvent.focus(input);
  expect(styleOf(box).borderTopColor).toBe(hairline);
  expect(styleOf(box).outlineWidth).toBe('0px');
});

it('draws its left tool at the 40 pt slot inside a 44 pt target', () => {
  const attach = vi.fn();
  renderInApp(
    <Composer
      value=""
      maxLength={100}
      accessibilityLabel="Nachricht"
      tool={{ icon: 'plus', label: 'Was möchtest du anhängen?', onPress: attach }}
    />,
  );
  const plus = screen.getByRole('button', { name: 'Was möchtest du anhängen?' });
  expect(styleOf(face(plus)).width).toBe('40px');
  expect(styleOf(plus).minWidth).toBe('44px');
  fireEvent.click(plus);
  expect(attach).toHaveBeenCalledOnce();
});

it('forwards the locked state as native editable=false to the sole text field', () => {
  renderInApp(<Composer value="Draft" maxLength={100} accessibilityLabel="Nachricht" disabled />);
  expect((screen.getByRole('textbox', { name: 'Nachricht' }) as HTMLTextAreaElement).readOnly).toBe(
    true,
  );
});

it('preserves an explicitly read-only field even when the bar is unlocked', () => {
  renderInApp(
    <Composer value="Draft" maxLength={100} accessibilityLabel="Nachricht" editable={false} />,
  );
  expect((screen.getByRole('textbox', { name: 'Nachricht' }) as HTMLTextAreaElement).readOnly).toBe(
    true,
  );
});
