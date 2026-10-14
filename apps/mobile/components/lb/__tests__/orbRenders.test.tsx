// Buddy's orb draws again only when what it shows changes (#637, #713, #715). Measured on the
// POCO X3 (dev JS, React Profiler): one orb render costs ~40 ms, and the head's orb and the
// thread's mini orb were drawn again with every render of the screen around them — each key she
// typed into a practice answer (two renders per key), the ⋯ menu opening, the screen leaving.
// The screen's own work is the screen's; the orb's moon moves on its own clock.

import { act } from '@testing-library/react';
import { useState } from 'react';
import { Text } from 'react-native';
import { expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { BuddyLine } from '../../buddy/ThreadParts.js';
import { TypingBubble } from '../../buddy/TypingBubble.js';
import { BuddyHeader } from '../BuddyHeader.js';
import type { MoonState } from '../BuddyOrb.js';

const drawn = vi.hoisted(() => ({ count: 0 }));
vi.mock('../BuddyOrb.js', () => ({
  BuddyOrb: ({ state }: { state?: string }) => {
    drawn.count += 1;
    return <div data-testid="orb" data-state={state} />;
  },
}));

/** A screen that renders for reasons of its own: her draft, and once, Buddy's state. */
function setUp(part: (draft: string, state: MoonState) => React.ReactNode) {
  let type: (text: string) => void = () => undefined;
  let pose: (state: MoonState) => void = () => undefined;
  function Host() {
    const [draft, setDraft] = useState('');
    const [state, setState] = useState<MoonState>('idle');
    type = setDraft;
    pose = setState;
    return <>{part(draft, state)}</>;
  }
  renderInApp(<Host />);
  return { type: (t: string) => act(() => type(t)), pose: (s: MoonState) => act(() => pose(s)) };
}

it('keeps the head orb still while the screen renders for her typing, and redraws it for a new state', () => {
  drawn.count = 0;
  const screen = setUp((draft, state) => (
    <BuddyHeader title="Bruchteile" subtitle={`Frage 3 · ${draft}`} state={state} menu={null} />
  ));
  expect(drawn.count).toBe(1);
  for (const text of ['3', '31', '313', '3131']) screen.type(text);
  expect(drawn.count).toBe(1);
  screen.pose('think');
  expect(drawn.count).toBe(2);
});

it('keeps the thread orb and the typing orb still while the conversation renders around them', () => {
  drawn.count = 0;
  const screen = setUp((draft) => (
    <>
      <BuddyLine orb>
        <Text>{draft}</Text>
      </BuddyLine>
      <TypingBubble label={`Buddy schreibt ${draft}`} />
    </>
  ));
  expect(drawn.count).toBe(2);
  for (const text of ['D', 'De', 'Der', 'Der N']) screen.type(text);
  expect(drawn.count).toBe(2);
});
