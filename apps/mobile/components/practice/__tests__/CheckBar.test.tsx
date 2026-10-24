// Her question in the one Composer (issue #402, report #388 §1, §9; #599). On every form without
// a typed answer the Composer's field is the way to ask the tutor: "Frag zur Aufgabe …". What is
// pinned here:
//
//   · one primary slot: "Prüfen" (quiet while it waits), "Weiter", or — where the answer can be
//     said and nothing is ready yet — the blue conversation button, never a grey one on the left;
//   · the placeholder stays beside "Prüfen" — it is what says the field is there to ask;
//   · once she has typed a question "Senden" takes the action's place, and sends it; locked, it
//     sends nothing.
//
// Where the bar stands and what it costs is the walkthrough's (tests/web/fit.ts, `room`).

import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useVoiceMode } from '../../../lib/speech/voiceMode.js';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { Btn } from '../../lb/Btn.js';
import { AskRoute, CheckBar, type CheckAction } from '../CheckBar.js';

/** Options she can say, none chosen yet. */
const SAYABLE: CheckAction = {
  ready: false,
  disabled: false,
  onPress: () => undefined,
  waitsHint: 'Wähl erst eine Antwort.',
  canTalk: true,
};

const BOARD: CheckAction = {
  ready: true,
  disabled: false,
  onPress: () => undefined,
  waitsHint: 'Leg erst alle an ihren Platz.',
};

function Asking({
  action,
  onSend = () => undefined,
  disabled = false,
  start = '',
}: {
  action: CheckAction;
  onSend?: (text: string) => void;
  disabled?: boolean;
  start?: string;
}) {
  const [value, setValue] = useState(start);
  return (
    <AskRoute.Provider
      value={{
        value,
        onChange: setValue,
        onSend: () => onSend(value),
        disabled,
        focused: false,
        onFocused: () => undefined,
      }}
    >
      <CheckBar {...action} />
    </AskRoute.Provider>
  );
}

function cssColor(color: string) {
  const element = document.createElement('div');
  element.style.backgroundColor = color;
  return element.style.backgroundColor;
}

const field = () => screen.getByRole('textbox', { name: 'Deine Frage zur Aufgabe' });

describe('her question in the bar', () => {
  it('stands under a form whose check still waits, beside the quiet "Prüfen"', () => {
    renderInApp(<Asking action={{ ...BOARD, ready: false }} />);
    expect(field().getAttribute('placeholder')).toBe('Frag zur Aufgabe …');
    const check = screen.getByRole('button', { name: 'Prüfen' });
    expect(check.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByTestId('composer-primary').contains(check)).toBe(true);
  });

  it('stands beside "Prüfen" on a board, with its placeholder', () => {
    renderInApp(<Asking action={BOARD} />);
    expect(field().getAttribute('placeholder')).toBe('Frag zur Aufgabe …');
    expect(screen.getByRole('button', { name: 'Prüfen' })).toBeDefined();
  });

  it('turns the action into "Senden" once she typed a question, and sends it', () => {
    const onSend = vi.fn();
    renderInApp(<Asking action={BOARD} onSend={onSend} />);
    fireEvent.change(field(), { target: { value: 'Warum ist das so?' } });
    expect(screen.queryByRole('button', { name: 'Prüfen' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(onSend).toHaveBeenCalledWith('Warum ist das so?');
  });

  it('sends nothing while the question is locked', () => {
    const onSend = vi.fn();
    renderInApp(<Asking action={BOARD} onSend={onSend} disabled start="Warum?" />);
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(onSend).not.toHaveBeenCalled();
  });
});

// Gespräch (issue #386): the waveform in the bar starts it in place, and the bar becomes the
// conversation row — "Tastatur" · the big mic · "Nochmal anhören", the conversation screen's.
describe('Gespräch in the bar', () => {
  const talk = (onReadAgain?: () => void): CheckAction => ({
    talk: {
      prompt: 'Welcher Bruch ist größer?',
      lang: null,
      disabled: false,
      onText: () => undefined,
      ...(onReadAgain ? { onReadAgain } : {}),
    },
  });

  it('offers the waveform only where the answer can be said', () => {
    renderInApp(<Asking action={{ ...BOARD, ready: false }} />);
    expect(screen.queryByRole('button', { name: 'Mit Buddy sprechen' })).toBeNull();
  });

  it('holds the blue waveform in the primary slot, never a grey one among the tools', () => {
    renderInApp(<Asking action={SAYABLE} />);
    const waves = screen.getAllByRole('button', { name: 'Mit Buddy sprechen' });
    expect(waves).toHaveLength(1);
    const primary = screen.getByTestId('composer-primary');
    expect(primary.contains(waves[0]!)).toBe(true);
    expect(styleOf(waves[0]!.firstElementChild!).backgroundColor).toBe(
      cssColor(paletteOf('pastell').primary),
    );
    // One slot, one control: the check takes it once an answer is chosen.
    expect(screen.queryByRole('button', { name: 'Prüfen' })).toBeNull();
  });

  it('starts the conversation with the waveform, and "Tastatur" ends it', () => {
    useVoiceMode.setState({ readAloud: false, conversation: false });
    const view = renderInApp(<Asking action={SAYABLE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mit Buddy sprechen' }));
    expect(useVoiceMode.getState().conversation).toBe(true);
    view.unmount();

    const readAgain = vi.fn();
    renderInApp(<Asking action={talk(readAgain)} />);
    // The row, not the input bar: no field, the mic and the two side actions.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Antwort sagen' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal anhören' }));
    expect(readAgain).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Tastatur' }));
    expect(useVoiceMode.getState().conversation).toBe(false);
  });

  it('keeps the row where the question must not be heard, without "Nochmal anhören"', () => {
    renderInApp(<Asking action={talk()} />);
    expect(screen.queryByRole('button', { name: 'Nochmal anhören' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tastatur' })).toBeTruthy();
  });
});

it('keeps a typed answer check in the single primary slot even before focus', () => {
  const checked = vi.fn();
  renderInApp(
    <Asking
      action={{
        ...BOARD,
        onPress: checked,
        field: { value: '12', maxLength: 100, accessibilityLabel: 'Antwort' },
        typing: false,
      }}
    />,
  );
  const check = screen.getByRole('button', { name: 'Prüfen' });
  expect(screen.getByTestId('composer-primary').contains(check)).toBe(true);
  expect(screen.getAllByRole('button', { name: 'Prüfen' })).toHaveLength(1);
  fireEvent.click(check);
  expect(checked).toHaveBeenCalledOnce();
});

it('advances a closed question from the same primary slot', () => {
  const next = vi.fn();
  renderInApp(<Asking action={{ next: { onPress: next } }} />);
  const button = screen.getByRole('button', { name: 'Weiter' });
  expect(screen.getByTestId('composer-primary').contains(button)).toBe(true);
  fireEvent.click(button);
  expect(next).toHaveBeenCalledOnce();
});

it('gives the one slot to "Prüfen" once a sayable answer is chosen', () => {
  useVoiceMode.setState({ readAloud: false, conversation: false });
  renderInApp(<Asking action={{ ...SAYABLE, ready: true }} />);
  const primary = screen.getByTestId('composer-primary');
  expect(primary.contains(screen.getByRole('button', { name: 'Prüfen' }))).toBe(true);
  expect(primary.querySelectorAll('[role="button"]')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Mit Buddy sprechen' })).toBeNull();
});

it('hosts a pass’s own action in the slot and its row of answers under the box', () => {
  const view = renderInApp(
    <Asking action={{ own: { primary: <Btn>Umdrehen</Btn>, row: null } }} />,
  );
  expect(
    screen
      .getByTestId('composer-primary')
      .contains(screen.getByRole('button', { name: 'Umdrehen' })),
  ).toBe(true);
  view.unmount();
  renderInApp(<Asking action={{ own: { primary: null, row: <Btn>Wusste ich</Btn> } }} />);
  const answer = screen.getByRole('button', { name: 'Wusste ich' });
  expect(screen.getAllByTestId('bottom-bar')).toHaveLength(1);
  expect(screen.getByTestId('bottom-bar').contains(answer)).toBe(true);
  expect(screen.getByTestId('composer-primary').contains(answer)).toBe(false);
});
