// The ways to start in the ⋯ menu come from the learning domain (issue #107): the core menu
// (components/buddy/StartSheets.tsx) holds which sheet is up, the domain draws its sheets. A tap
// goes from the menu to the homework choice and on to the topic sheet, one sheet at a time.

import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { registerLearning } from '../../../lib/learning/register.js';
import { renderInApp } from '../../../testing/render.js';
import { StartSheets } from '../../buddy/StartSheets.js';

registerLearning();
// requires live verification in Claude Code session — recording/API transport remains outside this mounted test.
function Harness({
  send,
  closed = () => undefined,
}: {
  send: (text: string) => void;
  closed?: () => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <StartSheets
      menuOpen={open}
      onOpenMenu={() => setOpen(true)}
      onCloseMenu={() => {
        setOpen(false);
        closed();
      }}
      next={[]}
      send={send}
      canStart
    />
  );
}

describe('the ways to start (issue #174)', () => {
  it('goes from "Hausaufgabe" to its choice and on to the topic sheet', async () => {
    const onCloseMenu = vi.fn();
    renderInApp(<Harness closed={onCloseMenu} send={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hausaufgabe' }));
    // The menu closes first: two modals in one frame do not come up on iOS.
    expect(onCloseMenu).toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Aufgabe eintippen' }));
    expect(await screen.findByText('Welche Aufgabe? Schreib sie ab.')).toBeTruthy();
  });

  it('says "Arbeit" to Buddy', () => {
    const send = vi.fn();
    renderInApp(<Harness send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Arbeit' }));
    return vi.waitFor(() => expect(send).toHaveBeenCalledWith('Ich schreibe bald eine Arbeit'));
  });
  it('returns from a topic to the factual chooser only after closing the topic host', async () => {
    renderInApp(<Harness send={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thema nennen, Du sagst, worum es geht' }));
    expect(await screen.findByText('Welches Thema?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(
      await screen.findByRole('button', { name: 'Thema nennen, Du sagst, worum es geht' }),
    ).toBeTruthy();
    expect(screen.queryByText('Welches Thema?')).toBeNull();
  });
});
