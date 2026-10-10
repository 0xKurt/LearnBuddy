// The ways to start in the ⋯ menu come from the learning domain (issue #107): the core menu
// (components/buddy/StartSheets.tsx) holds which sheet is up, the domain draws its sheets. A tap
// goes from the menu to the homework choice and on to the topic sheet, one sheet at a time.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { registerLearning } from '../../../lib/learning/register.js';
import { renderInApp } from '../../../testing/render.js';
import { StartSheets } from '../../buddy/StartSheets.js';

registerLearning();

describe('the ways to start (issue #174)', () => {
  it('goes from "Hausaufgabe" to its choice and on to the topic sheet', async () => {
    const onCloseMenu = vi.fn();
    renderInApp(
      <StartSheets menuOpen onCloseMenu={onCloseMenu} next={[]} send={() => undefined} canStart />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hausaufgabe' }));
    // The menu closes first: two modals in one frame do not come up on iOS.
    expect(onCloseMenu).toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Aufgabe eintippen' }));
    expect(await screen.findByText('Welche Aufgabe? Schreib sie ab.')).toBeTruthy();
  });

  it('says "Arbeit" to Buddy', () => {
    const send = vi.fn();
    renderInApp(
      <StartSheets menuOpen onCloseMenu={() => undefined} next={[]} send={send} canStart />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Arbeit' }));
    return vi.waitFor(() => expect(send).toHaveBeenCalledWith('Ich schreibe bald eine Arbeit'));
  });
});
