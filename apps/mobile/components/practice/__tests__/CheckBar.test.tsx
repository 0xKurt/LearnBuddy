// Her question in the one bar (issue #402, report #388 §1, §9). On every form without a typed
// answer the input bar's field is the way to ask the tutor: "Frag zur Aufgabe …". What is pinned
// here:
//
//   · options she taps get the bar with the field, and no "Prüfen" (the tile is the answer);
//   · a board keeps "Prüfen" at the pill's end, and the placeholder stays beside it — it is what
//     says the field is there to ask (#394 hides it beside the chat's "Senden" only);
//   · once she has typed a question "Senden" takes the action's place, and sends it; locked, it
//     sends nothing.
//
// Where the bar stands and what it costs is the walkthrough's (tests/web/fit.ts, `room`).

import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { AskRoute, CheckBar, type CheckAction } from '../CheckBar.js';

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
    <AskRoute.Provider value={{ value, onChange: setValue, onSend: () => onSend(value), disabled }}>
      <CheckBar {...action} />
    </AskRoute.Provider>
  );
}

const field = () => screen.getByRole('textbox', { name: 'Deine Frage zur Aufgabe' });

describe('her question in the bar', () => {
  it('stands under options she taps, without "Prüfen"', () => {
    renderInApp(<Asking action={{ tap: true }} />);
    expect(field().getAttribute('placeholder')).toBe('Frag zur Aufgabe …');
    expect(screen.queryByRole('button', { name: 'Prüfen' })).toBeNull();
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
    renderInApp(<Asking action={{ tap: true }} onSend={onSend} disabled start="Warum?" />);
    fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(onSend).not.toHaveBeenCalled();
  });
});
