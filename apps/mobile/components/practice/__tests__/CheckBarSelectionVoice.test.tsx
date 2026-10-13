import { act, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { voiceStore } from '../../../lib/speech/voiceState.js';
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

// Practice in conversation as the design has it (ui_kits/app/Gaps.jsx:133–144, #599).
it('says "Ich höre zu." only while the recorder runs, and "Buddy spricht …" only while he is heard', () => {
  // A new element each time: the same one would not render again.
  const bar = () => (
    <CheckBar talk={{ prompt: 'Frage', lang: null, disabled: false, onText: () => undefined }} />
  );
  mic.state = 'idle';
  const view = renderInApp(bar());
  expect(screen.queryByTestId('talk-row-status')).toBeNull();
  mic.state = 'starting';
  view.rerender(bar());
  expect(screen.queryByText('Ich höre zu.')).toBeNull();
  mic.state = 'recording';
  view.rerender(bar());
  expect(screen.getByTestId('talk-row-status').textContent).toBe('Ich höre zu.');
  mic.state = 'idle';
  view.rerender(bar());
  act(() => voiceStore.set({ phase: 'loading' }));
  expect(screen.queryByTestId('talk-row-status')).toBeNull();
  act(() => voiceStore.set({ phase: 'speaking' }));
  expect(screen.getByTestId('talk-row-status').textContent).toBe('Buddy spricht …');
  act(() => voiceStore.reset());
});

it('shows no greyed Check beside the running microphone, and none of the Composer’s chips', () => {
  mic.state = 'recording';
  const view = renderInApp(
    <CheckBar
      ready={false}
      disabled={false}
      onPress={() => undefined}
      waitsHint="Wähle zuerst eine Antwort."
      spoken={{ prompt: 'Frage', lang: null, disabled: false, onText: () => undefined }}
      chips={<span>Tipp</span>}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Prüfen' })).toBeNull();
  expect(screen.queryByText('Tipp')).toBeNull();
  // Chosen while it records: the Check is there, and it can be pressed.
  view.rerender(
    <CheckBar
      ready
      disabled={false}
      onPress={() => undefined}
      waitsHint=""
      spoken={{ prompt: 'Frage', lang: null, disabled: false, onText: () => undefined }}
    />,
  );
  expect(screen.getByRole('button', { name: 'Prüfen' }).getAttribute('aria-disabled')).not.toBe(
    'true',
  );
  mic.state = 'idle';
});
