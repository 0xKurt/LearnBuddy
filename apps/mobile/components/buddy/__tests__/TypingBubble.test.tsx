import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { TypingBubble } from '../TypingBubble.js';

it('shows the actual thinking status without a second Orb or pulsing decoration', () => {
  renderInApp(<TypingBubble label="Buddy schreibt …" />);
  expect(screen.getByText('Buddy schreibt …')).toBeTruthy();
  expect(screen.getByLabelText('Buddy schreibt …').getAttribute('aria-live')).toBe('polite');
  expect(screen.queryAllByRole('img')).toHaveLength(0);
});
