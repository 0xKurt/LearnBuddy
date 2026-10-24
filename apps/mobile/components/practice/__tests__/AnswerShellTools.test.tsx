import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { Btn } from '../../lb/Btn.js';
import { AnswerFlow, AnswerShell } from '../AnswerShell.js';
import { PRACTICE_SCREEN } from '../../../lib/theme/practiceScreen.js';
import { PictureRoom } from '../../../lib/practice/screenRoom.js';
import { AskRoute } from '../CheckBar.js';

const seen = vi.hoisted(() => ({ window: 440, visible: 440, overlap: 0 }));
vi.mock('../../../lib/useVisibleHeight.js', () => ({ useVisibleHeight: () => seen }));
beforeEach(() => Object.assign(seen, { window: 440, visible: 440, overlap: 0 }));

function Typed({ hint, body = false }: { hint: () => void; body?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState('6');
  return (
    <AnswerFlow.Provider
      value={{
        thread: null,
        tools: <Btn onPress={hint}>Tipp</Btn>,
        ...(body ? { question: <div>Whole typed question</div> } : {}),
      }}
    >
      <AnswerShell
        action={{
          ready: true,
          disabled: false,
          onPress: () => undefined,
          waitsHint: '',
          typing: focused,
          field: {
            value,
            maxLength: 100,
            onChangeText: setValue,
            onFocus: () => setFocused(true),
            onBlur: () => setFocused(false),
            accessibilityLabel: 'Deine Antwort',
          },
        }}
      />
    </AnswerFlow.Provider>
  );
}

it('folds optional tools only for a focused typed answer in tight room and restores callbacks/draft', () => {
  const hint = vi.fn();
  const app = renderInApp(<Typed hint={hint} />);
  expect(screen.getAllByTestId('bottom-bar')).toHaveLength(1);
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

it('folds optional tools while she asks about a board in tight room, preserving her question', () => {
  const hint = vi.fn();
  const content = (focused: boolean) => (
    <AskRoute.Provider
      value={{
        value: 'Warum?',
        focused,
        onFocused: () => undefined,
        onChange: () => undefined,
        onSend: () => undefined,
        disabled: false,
      }}
    >
      <AnswerFlow.Provider value={{ thread: null, tools: <Btn onPress={hint}>Tipp</Btn> }}>
        <AnswerShell
          answer={<Btn>Answer tile</Btn>}
          keeps="whole"
          action={{ ready: false, disabled: false, onPress: () => undefined, waitsHint: '' }}
        />
      </AnswerFlow.Provider>
    </AskRoute.Provider>
  );
  const app = renderInApp(content(false));
  expect(screen.getByRole('button', { name: 'Tipp' })).toBeTruthy();
  app.rerender(content(true));
  expect(screen.queryByRole('button', { name: 'Tipp' })).toBeNull();
  expect((screen.getByTestId('ask-field') as HTMLTextAreaElement).value).toBe('Warum?');
  app.rerender(content(false));
  fireEvent.click(screen.getByRole('button', { name: 'Tipp' }));
  expect(hint).toHaveBeenCalledOnce();
});

it('folds optional help during tight board editing without hiding the board or draft', () => {
  const props = {
    action: { ready: true, disabled: false, onPress: () => undefined, waitsHint: '' },
    answer: <input aria-label="Board cell" defaultValue="17" />,
  };
  const content = (editing: boolean) => (
    <AnswerFlow.Provider value={{ thread: null, tools: <Btn>Tipp</Btn> }}>
      <AnswerShell {...props} boardEditing={editing} />
    </AnswerFlow.Provider>
  );
  const app = renderInApp(content(false));
  expect(screen.getByRole('button', { name: 'Tipp' })).toBeTruthy();
  app.rerender(content(true));
  expect(screen.queryByRole('button', { name: 'Tipp' })).toBeNull();
  expect(screen.getByRole('textbox', { name: 'Board cell' })).toBeTruthy();
  expect((screen.getByLabelText('Board cell') as HTMLInputElement).value).toBe('17');
  expect(screen.getByRole('button', { name: 'Prüfen' })).toBeTruthy();
  app.rerender(content(false));
  expect(screen.getByRole('button', { name: 'Tipp' })).toBeTruthy();
});

it('ordinary typed input keeps its real hint in the pinned bar without losing focus or draft', () => {
  const hint = vi.fn();
  renderInApp(<Typed hint={hint} body />);
  expect(screen.getAllByTestId('bottom-bar')).toHaveLength(1);
  const field = screen.getByRole('textbox', { name: 'Deine Antwort' });
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '7' } });
  const button = screen.getByRole('button', { name: 'Tipp' });
  expect(screen.getByTestId('bottom-bar').contains(button)).toBe(true);
  expect(screen.getByTestId('scroll-practice-body').contains(button)).toBe(false);
  fireEvent.click(button);
  expect(hint).toHaveBeenCalledOnce();
  expect((field as HTMLTextAreaElement).value).toBe('7');
});

it('gives optional help back when a whole answer board pushes the bar past the screen', () => {
  Object.assign(seen, { window: 844, visible: 844 });
  const content = (spare: number) => (
    <PictureRoom.Provider value={spare}>
      <AnswerFlow.Provider value={{ thread: null, tools: <Btn>Tipp</Btn> }}>
        <AnswerShell
          answer={<input aria-label="Board answer" defaultValue="50,10" />}
          keeps="whole"
          action={{ ready: true, disabled: false, onPress: () => undefined, waitsHint: '' }}
        />
      </AnswerFlow.Provider>
    </PictureRoom.Provider>
  );
  const app = renderInApp(content(0));
  expect(screen.getByRole('button', { name: 'Tipp' })).toBeTruthy();
  app.rerender(content(-13));
  expect(screen.queryByRole('button', { name: 'Tipp' })).toBeNull();
  expect((screen.getByLabelText('Board answer') as HTMLInputElement).value).toBe('50,10');
  expect(screen.getByRole('button', { name: 'Prüfen' })).toBeTruthy();
  app.rerender(content(100));
  expect(screen.getByRole('button', { name: 'Tipp' })).toBeTruthy();
});

it('keeps help when a scrollable answer can shrink instead of folding the row', () => {
  Object.assign(seen, { window: 740, visible: 740 });
  renderInApp(
    <PictureRoom.Provider value={-13}>
      <AnswerFlow.Provider value={{ thread: null, tools: <Btn>Tipp</Btn> }}>
        <AnswerShell
          answer={<input aria-label="Reading answer" defaultValue="15,16" />}
          keeps={PRACTICE_SCREEN.markedPassageMin}
          action={{ ready: true, disabled: false, onPress: () => undefined, waitsHint: '' }}
        />
      </AnswerFlow.Provider>
    </PictureRoom.Provider>,
  );
  expect(screen.getByRole('button', { name: 'Tipp' })).toBeTruthy();
  expect((screen.getByLabelText('Reading answer') as HTMLInputElement).value).toBe('15,16');
});
