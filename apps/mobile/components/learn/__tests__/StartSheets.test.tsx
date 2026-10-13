// The ways to start come from the learning domain (issue #107) and stand in the start sheet
// "Was willst du üben?" (#599; design ui_kits/app/Extra.jsx `StartSheet`, components/practice/
// Modes.jsx `ChoiceList`) — no longer as a grid of tiles in the ⋯ menu, which is one list of
// places now. The chat's menu has one row that leads there. The core (components/buddy/
// StartSheets.tsx) holds which sheet is up; a tap goes from the menu to the start sheet, to the
// homework choice and on to the topic sheet, one sheet at a time.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { registerLearning } from '../../../lib/learning/register.js';
import { renderInApp } from '../../../testing/render.js';
import { StartSheets } from '../../buddy/StartSheets.js';

registerLearning();

const WAYS = ['Arbeit', 'Hausaufgabe', 'Aussprache', 'Vokabeln'];

function openStart(props: { send?: (text: string) => void; onCloseMenu?: () => void } = {}) {
  renderInApp(
    <StartSheets
      menuOpen
      onCloseMenu={props.onCloseMenu ?? (() => undefined)}
      next={[]}
      send={props.send ?? (() => undefined)}
      canStart
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Was willst du üben?' }));
}

describe('the ways to start (issue #174, #599)', () => {
  it('are not tiles in the ⋯ menu: its one row leads to the start sheet', async () => {
    const onCloseMenu = vi.fn();
    renderInApp(
      <StartSheets menuOpen onCloseMenu={onCloseMenu} next={[]} send={() => undefined} canStart />,
    );
    for (const way of WAYS) expect(screen.queryByRole('button', { name: way })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Was willst du üben?' }));
    // The menu closes first: two modals in one frame do not come up on iOS.
    expect(onCloseMenu).toHaveBeenCalled();
    for (const way of WAYS) expect(await screen.findByRole('button', { name: way })).toBeTruthy();
  });

  it('holds the way in while Buddy is answering', () => {
    renderInApp(
      <StartSheets
        menuOpen
        onCloseMenu={() => undefined}
        next={[]}
        send={() => undefined}
        canStart={false}
      />,
    );
    const row = screen.getByRole('button', { name: 'Was willst du üben?' });
    expect(row.getAttribute('aria-disabled')).toBe('true');
  });

  it('goes from "Hausaufgabe" to its choice and on to the topic sheet', async () => {
    openStart();
    fireEvent.click(await screen.findByRole('button', { name: 'Hausaufgabe' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aufgabe eintippen' }));
    expect(await screen.findByText('Welche Aufgabe? Schreib sie ab.')).toBeTruthy();
  });

  it('says "Arbeit" to Buddy', async () => {
    const send = vi.fn();
    openStart({ send });
    fireEvent.click(await screen.findByRole('button', { name: 'Arbeit' }));
    return vi.waitFor(() => expect(send).toHaveBeenCalledWith('Ich schreibe bald eine Arbeit'));
  });
});
