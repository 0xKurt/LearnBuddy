import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { Btn } from '../Btn.js';
import { Composer } from '../Composer.js';

it('keeps one primary slot while typed text replaces the conversation action', () => {
  const sent = vi.fn();
  const talk = vi.fn();
  function Bar() {
    const [value, setValue] = useState('');
    return (
      <Composer
        value={value}
        onChangeText={setValue}
        accessibilityLabel="Nachricht"
        primary={
          value.trim() ? (
            <Btn onPress={() => sent(value)}>Senden</Btn>
          ) : (
            <Btn onPress={talk}>Gespräch</Btn>
          )
        }
      />
    );
  }
  renderInApp(<Bar />);
  fireEvent.click(screen.getByRole('button', { name: 'Gespräch' }));
  expect(talk).toHaveBeenCalledOnce();
  const slot = screen.getByTestId('composer-primary');
  fireEvent.change(screen.getByRole('textbox', { name: 'Nachricht' }), {
    target: { value: 'Hilf mir bitte' },
  });
  expect(screen.queryByRole('button', { name: 'Gespräch' })).toBeNull();
  const send = screen.getByRole('button', { name: 'Senden' });
  expect(slot.contains(send)).toBe(true);
  fireEvent.click(send);
  expect(sent).toHaveBeenCalledWith('Hilf mir bitte');
});

it('keeps supplied keyboard tools within the same surface as the text and primary', () => {
  renderInApp(
    <Composer
      value="3"
      accessibilityLabel="Antwort"
      keys={<Btn>x²</Btn>}
      primary={<Btn>Prüfen</Btn>}
    />,
  );
  const input = screen.getByRole('textbox', { name: 'Antwort' });
  const frame = input.parentElement?.parentElement;
  expect(frame?.contains(screen.getByRole('button', { name: 'x²' }))).toBe(true);
  expect(frame?.contains(screen.getByRole('button', { name: 'Prüfen' }))).toBe(true);
});
