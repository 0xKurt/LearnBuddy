import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { CheckBar } from '../CheckBar.js';

const mic = vi.hoisted(() => ({
  onText: (_text: string): void => undefined,
  cancel: vi.fn(),
  state: 'idle',
}));
vi.mock('../../voice/useVoiceInput.js', () => ({
  useVoiceInput: ({ onText }: { onText: (text: string) => void }) => {
    mic.onText = onText;
    return { state: mic.state, cancel: mic.cancel };
  },
}));
vi.mock('../../voice/useHandsFreeMic.js', () => ({ useHandsFreeMic: vi.fn() }));
vi.mock('../../voice/VoiceRow.js', () => ({
  VoiceRow: ({
    action,
    centerAction,
    left,
    mic: input,
  }: {
    action: React.ReactNode;
    centerAction: React.ReactNode;
    left: { onPress: () => void };
    mic: { filled: boolean };
  }) => (
    <div
      data-testid="voice"
      data-filled={String(input.filled)}
      data-center-check={String(Boolean(centerAction))}
    >
      <button aria-label="Keyboard" onClick={left.onPress} />
      {centerAction ?? action}
    </div>
  ),
}));

it('checks selection once, rejects late speech, and restores voice on an unlocked retry', () => {
  const checked = vi.fn();
  const spoken = vi.fn();
  const action = (disabled: boolean) => (
    <CheckBar
      ready
      disabled={disabled}
      onPress={checked}
      waitsHint=""
      spoken={{ prompt: 'Frage', lang: null, disabled, onText: spoken }}
    />
  );
  const view = renderInApp(action(false));
  expect(screen.getByTestId('voice').getAttribute('data-filled')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
  act(() => mic.onText('verspätet'));
  expect(checked).toHaveBeenCalledOnce();
  expect(mic.cancel).toHaveBeenCalledOnce();
  expect(spoken).not.toHaveBeenCalled();
  view.rerender(action(true));
  view.rerender(action(false));
  act(() => mic.onText('erneuter Versuch'));
  expect(spoken).toHaveBeenCalledWith('erneuter Versuch');
});

it('keeps recording central, then puts ready Check in the same central slot and blocks late keyboard results', () => {
  mic.state = 'recording';
  const spoken = vi.fn();
  const action = (
    <CheckBar
      ready
      disabled={false}
      onPress={() => undefined}
      waitsHint=""
      spoken={{ prompt: 'Andere Frage', lang: null, disabled: false, onText: spoken }}
    />
  );
  const view = renderInApp(action);
  expect(screen.getByTestId('voice').getAttribute('data-center-check')).toBe('false');
  expect(screen.getByTestId('voice').getAttribute('data-filled')).toBe('true');
  mic.state = 'idle';
  view.rerender(
    <CheckBar
      ready
      disabled={false}
      onPress={() => undefined}
      waitsHint=""
      spoken={{ prompt: 'Andere Frage', lang: null, disabled: false, onText: spoken }}
    />,
  );
  expect(screen.getByTestId('voice').getAttribute('data-center-check')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Keyboard' }));
  act(() => mic.onText('verspätet'));
  expect(spoken).not.toHaveBeenCalled();
});
