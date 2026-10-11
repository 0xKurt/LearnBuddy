import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { Btn } from '../../lb/Btn.js';
import { InputBar } from '../../lb/InputBar.js';
import { AnswerFlow, AnswerShell } from '../AnswerShell.js';

const seen = vi.hoisted(() => ({ window: 440, visible: 440, overlap: 0 }));
vi.mock('../../../lib/useVisibleHeight.js', () => ({ useVisibleHeight: () => seen }));
beforeEach(() => Object.assign(seen, { window: 440, visible: 440, overlap: 0 }));

function Typed({ hint }: { hint: () => void }) {
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState('6');
  return (
    <AnswerFlow.Provider value={{ thread: null, tools: <Btn onPress={hint}>Tipp</Btn> }}>
      <AnswerShell
        action={{
          ready: true,
          disabled: false,
          onPress: () => undefined,
          waitsHint: '',
          typing: focused,
          input: (check) => (
            <InputBar
              value={value}
              maxLength={100}
              onChangeText={setValue}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              accessibilityLabel="Deine Antwort"
              action={check}
            />
          ),
        }}
      />
    </AnswerFlow.Provider>
  );
}

it('folds optional tools only for a focused typed answer in tight room and restores callbacks/draft', () => {
  const hint = vi.fn();
  const app = renderInApp(<Typed hint={hint} />);
  const field = screen.getByRole('textbox', { name: 'Deine Antwort' });
  expect(screen.getByRole('button', { name: 'Tipp' })).toBeTruthy();
  fireEvent.change(field, { target: { value: '12' } });
  fireEvent.focus(field);
  expect(screen.queryByRole('button', { name: 'Tipp' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Prüfen' })).toBeTruthy();
  fireEvent.blur(field);
  fireEvent.click(screen.getByRole('button', { name: 'Tipp' }));
  expect(hint).toHaveBeenCalledOnce();
  fireEvent.focus(field);
  expect(screen.queryByRole('button', { name: 'Tipp' })).toBeNull();
  Object.assign(seen, { window: 740, visible: 740 });
  app.rerender(<Typed hint={hint} />);
  expect(screen.getByRole('button', { name: 'Tipp' })).toBeTruthy();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('12');
});

it('keeps tools beside a drafted choice Check in tight room', () => {
  renderInApp(
    <AnswerFlow.Provider value={{ thread: null, tools: <Btn>Tipp</Btn> }}>
      <AnswerShell
        action={{ ready: true, disabled: false, onPress: () => undefined, waitsHint: '' }}
      />
    </AnswerFlow.Provider>,
  );
  expect(screen.getByRole('button', { name: 'Tipp' })).toBeTruthy();
});
