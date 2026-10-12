// requires live verification in Claude Code session — the local fold provider exercises
// the shared disclosure boundary; the real Settings browser cases cover its actual callers.

import { useState } from 'react';
import { Text } from 'react-native';
import { fireEvent, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { FoldContext, Group } from '../Group.js';
function SettingsDetail() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <FoldContext.Provider
      value={{ open, toggle: (key) => setOpen((old) => (old === key ? null : key)) }}
    >
      <Group title="Sprache" summary="Deutsch" fold="language">
        <Text>Editorinhalt</Text>
      </Group>
    </FoldContext.Provider>
  );
}
it('expands real child content inline without creating a parent modal', () => {
  renderInApp(<SettingsDetail />);
  expect(screen.queryByText('Editorinhalt')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Sprache/ }));
  expect(screen.getByText('Editorinhalt')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Sprache/ }).getAttribute('aria-expanded')).toBe(
    'true',
  );
  expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Sprache/ }));
  expect(screen.queryByText('Editorinhalt')).toBeNull();
  expect(screen.getByRole('button', { name: /Sprache/ }).getAttribute('aria-expanded')).toBe(
    'false',
  );
});
