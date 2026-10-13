import { act, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { AskRoute, CheckBar } from '../CheckBar.js';

const dictation = vi.hoisted(() => ({
  onText: (_said: string): void => undefined,
  purpose: '',
  cancel: vi.fn(),
}));
vi.mock('../../voice/useVoiceInput.js', () => ({
  useVoiceInput: ({ onText, purpose }: { onText: (said: string) => void; purpose: string }) => {
    dictation.onText = onText;
    dictation.purpose = purpose;
    return { state: 'idle', cancel: dictation.cancel };
  },
}));
vi.mock('../../lb/Composer.js', () => ({
  Composer: ({
    value,
    voice,
    micLabel,
    disabled,
  }: {
    value: string;
    voice?: unknown;
    micLabel: string;
    disabled: boolean;
  }) => (
    <div>
      <input aria-label="Tutor question" value={value} readOnly />
      <button disabled={disabled} aria-label={micLabel} data-has-voice={String(Boolean(voice))} />
    </div>
  ),
  ActionPill: () => null,
}));

function Board({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState('Warum');
  return (
    <AskRoute.Provider
      value={{
        value,
        onChange: setValue,
        onSend: () => undefined,
        disabled,
        focused: false,
        onFocused: () => undefined,
      }}
    >
      <CheckBar ready disabled={disabled} onPress={() => undefined} waitsHint="" />
    </AskRoute.Provider>
  );
}

it('dictates into the existing tutor-question draft without submitting or replacing it', () => {
  renderInApp(<Board />);
  expect(dictation.purpose).toBe('message');
  expect(
    screen.getByRole('button', { name: 'Nachricht sprechen' }).getAttribute('data-has-voice'),
  ).toBe('true');
  act(() => dictation.onText('ist das so?'));
  expect((screen.getByRole('textbox', { name: 'Tutor question' }) as HTMLInputElement).value).toBe(
    'Warum ist das so?',
  );
});

it('cancels on lock and unmount and rejects a late transcript while locked', () => {
  dictation.cancel.mockClear();
  const { rerender, unmount } = renderInApp(<Board />);
  rerender(<Board disabled />);
  expect(dictation.cancel).toHaveBeenCalledTimes(1);
  act(() => dictation.onText('late'));
  expect((screen.getByRole('textbox', { name: 'Tutor question' }) as HTMLInputElement).value).toBe(
    'Warum',
  );
  expect(
    (screen.getByRole('button', { name: 'Nachricht sprechen' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  unmount();
  expect(dictation.cancel).toHaveBeenCalledTimes(2);
});
