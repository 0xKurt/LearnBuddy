// Buddy is writing (design components/buddy/Cards.jsx:96–103): his mini orb at 22 and three
// still dots — plain views at fixed tones, only the orb moves by itself (HANDOFF §4). The redesign had dropped the orb and left a grey line of text (#599).
import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { CHAT } from '../../../lib/theme/chat.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { TypingBubble } from '../TypingBubble.js';

it('shows Buddy’s mini orb and three still dots, and says the status to a screen reader', () => {
  renderInApp(<TypingBubble label="Buddy schreibt …" />);
  const status = screen.getByLabelText('Buddy schreibt …');
  expect(status.getAttribute('aria-live')).toBe('polite');
  // The words are for the screen reader; the eye gets the orb and the dots.
  expect(screen.queryByText('Buddy schreibt …')).toBeNull();
  const orb = screen.getByTestId('thread-orb');
  expect(styleOf(orb).width).toBe(`${CHAT.typing.orb}px`);
  const dots = Array.from(orb.nextElementSibling!.children);
  expect(dots.map((dot) => styleOf(dot).opacity)).toEqual(CHAT.typingDots.map(String));
  expect(dots.every((dot) => styleOf(dot).width === `${CHAT.typing.dot}px`)).toBe(true);
  expect(dots).toHaveLength(3);
});
