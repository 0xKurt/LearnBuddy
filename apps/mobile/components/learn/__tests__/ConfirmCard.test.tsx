// Buddy proposed to delete something; the card is where she decides (issue #151), in the
// design's confirm shape (components/buddy/Cards.jsx:34–52, #599). What it must keep whatever it
// looks like: the name of what would go, the sentence that this cannot be taken back, a button
// that says exactly what it does, the way out beside it — and afterwards what was decided.
//
// requires live verification in Claude Code session — the API call is a stand-in here.

import type { ActionSummary } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderInApp, styleOf } from '../../../testing/render.js';
import { ConfirmCard } from '../ConfirmCard.js';

const api = vi.hoisted(() => ({ answerConfirmation: vi.fn(() => Promise.resolve()) }));
vi.mock('../../../lib/api/endpoints.js', () => api);

type Confirm = Extract<ActionSummary, { tool: 'confirm_delete' }>;

const PENDING = '44444444-4444-4444-8444-444444444444';
const SHEET: Confirm = {
  tool: 'confirm_delete',
  pending_id: PENDING,
  what: 'material',
  title: 'Brüche kürzen und vergleichen',
  detail: null,
  status: 'open',
};

beforeEach(() => api.answerConfirmation.mockClear());

describe('the delete confirmation (issue #151)', () => {
  it('asks as a heading, names the sheet and says once that it cannot be taken back', () => {
    renderInApp(<ConfirmCard confirm={SHEET} />);
    expect(screen.getByRole('heading', { name: 'Dieses Blatt löschen?' })).toBeTruthy();
    // A long name is cut after three lines, never the question or the buttons pushed away.
    expect(styleOf(screen.getByText('Brüche kürzen und vergleichen')).webkitLineClamp).toBe('3');
    expect(
      screen.getByText(
        'Das Blatt, seine Fragen und die Fotos sind danach weg. Das lässt sich nicht rückgängig machen.',
      ),
    ).toBeTruthy();
  });

  it('offers exactly two answers, in the design’s order: what it does, then the way out', () => {
    renderInApp(<ConfirmCard confirm={SHEET} />);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Blatt löschen', 'Behalten']);
    // Danger ink on a paper pill, never a red fill and never the violet button (Cards.jsx:46).
    const destroy = screen.getByRole('button', { name: 'Blatt löschen' });
    expect(styleOf(destroy.firstElementChild!).borderTopWidth).toBe('1px');
    expect(screen.getByText('Blatt löschen').style.color).not.toBe(
      screen.getByText('Behalten').style.color,
    );
    const keep = screen.getByRole('button', { name: 'Behalten' });
    expect(styleOf(keep.firstElementChild!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('sends her answer once, by the pending id — yes only from the button that says so', async () => {
    renderInApp(<ConfirmCard confirm={SHEET} />);
    fireEvent.click(screen.getByRole('button', { name: 'Behalten' }));
    await vi.waitFor(() => expect(api.answerConfirmation).toHaveBeenCalledWith(PENDING, false));
    expect(api.answerConfirmation).toHaveBeenCalledTimes(1);
  });

  it('deletes only on "Blatt löschen"', async () => {
    renderInApp(<ConfirmCard confirm={SHEET} />);
    fireEvent.click(screen.getByRole('button', { name: 'Blatt löschen' }));
    await vi.waitFor(() => expect(api.answerConfirmation).toHaveBeenCalledWith(PENDING, true));
  });

  it('names a question by its words and its own button', () => {
    renderInApp(
      <ConfirmCard
        confirm={{ ...SHEET, what: 'item', title: null, detail: 'Was ist 3/4 + 1/8?' }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Diese Frage löschen?' })).toBeTruthy();
    expect(screen.getByText('Was ist 3/4 + 1/8?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Frage löschen' })).toBeTruthy();
  });

  it.each([
    ['confirmed', 'Das Blatt ist weg.'],
    ['declined', 'Alles bleibt, wie es war.'],
    ['expired', 'Diese Frage ist nicht mehr offen.'],
    ['superseded', 'Diese Frage ist nicht mehr offen.'],
  ] as const)('once %s it says what was decided and offers nothing more', (status, words) => {
    renderInApp(<ConfirmCard confirm={{ ...SHEET, status }} />);
    expect(screen.getByText(words)).toBeTruthy();
    expect(screen.getByText('Brüche kürzen und vergleichen')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
