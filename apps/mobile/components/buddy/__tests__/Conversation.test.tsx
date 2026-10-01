// The receipts under one of Buddy's messages — what he did, with the way back (issue #191).
//
// On the phone the owner saw a green pill with "✓" on one line and "Ein" on the next. The
// sentence was "Eingetragen: Mathearbeit Brüche am Freitag, 2. Oktober". It was a `Text` with
// `flex: 1` sitting NEXT TO the "Rückgängig" button inside a row: the button took the width
// it wanted, the text got what was left, and what was left fitted three letters. The column
// around it also stood in a block that aligns its children to the side, so each receipt was
// only as wide as its own button.
//
// Both causes are structural, and both are visible here: whether the sentence shares a row
// with a button, and whether the column stretches. How many pixels the sentence ends up with
// is not — jsdom lays nothing out; that is tests/web.

import type { ActionView, MessageView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { commonBox, renderInApp, styleOf } from '../../../testing/render.js';
import { Conversation } from '../Conversation.js';

/** The real sentence from the owner's phone, 01.10. */
const SENTENCE = 'Eingetragen: Mathearbeit Brüche am Freitag, 2. Oktober';

const PLAN_EXAM: ActionView = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'applied',
  undoable: true,
  summary: {
    tool: 'plan_exam',
    goal_id: '22222222-2222-4222-8222-222222222222',
    title: 'Mathearbeit Brüche',
    due_date: '2026-10-02',
    subject_name: 'Mathe',
  },
  created_at: '2026-10-01T18:00:00.000Z',
};

function buddySaid(actions: ActionView[]): MessageView {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    role: 'buddy',
    text: 'Alles klar, ich habe die Arbeit eingetragen.',
    status: 'done',
    failure_code: null,
    client_message_id: null,
    options: null,
    reply_to_id: null,
    outreach: null,
    actions,
    created_at: '2026-10-01T18:00:00.000Z',
  };
}

function renderThread(onUndo?: (actionId: string) => void) {
  return renderInApp(
    <Conversation
      messages={[buddySaid([PLAN_EXAM])]}
      pending={null}
      busy={false}
      showActions
      onUndo={onUndo}
    />,
  );
}

describe('a receipt gets the whole line (issue #191)', () => {
  it('says what Buddy did in full, not clipped to its first word', () => {
    renderThread();
    // The whole sentence stands as one piece of text. "Ein" was all she could read.
    expect(screen.getByText(SENTENCE)).toBeTruthy();
  });

  it('does not make the sentence share a row with the undo button', () => {
    renderThread(() => undefined);
    const sentence = screen.getByText(SENTENCE);
    const undo = screen.getByRole('button', { name: `Rückgängig machen: ${SENTENCE}` });
    // The nearest box holding both decides it: a row puts them side by side and the longer
    // one loses, a column puts the way back underneath. That row was the bug.
    expect(
      styleOf(commonBox(sentence, undo)).flexDirection,
      'the sentence and "Rückgängig" must not divide one row between them',
    ).not.toBe('row');
  });

  it('stretches across the message block instead of shrinking to its button', () => {
    renderThread(() => undefined);
    const undo = screen.getByRole('button', { name: `Rückgängig machen: ${SENTENCE}` });
    const column = commonBox(screen.getByText(SENTENCE), undo);
    // Buddy's messages sit in a block with `alignItems: 'flex-start'`. Anything inside it
    // that must be wider than its content has to say so.
    const stretching = [...ancestors(column)].some((el) => styleOf(el).alignSelf === 'stretch');
    expect(
      stretching,
      'without alignSelf stretch each receipt is only as wide as its own button',
    ).toBe(true);
  });
});

describe('the way back works (UX-PRINCIPLES: undo over confirmation)', () => {
  it('hands the action id to onUndo when she taps Rückgängig', () => {
    const onUndo = vi.fn();
    renderThread(onUndo);
    fireEvent.click(screen.getByRole('button', { name: `Rückgängig machen: ${SENTENCE}` }));
    expect(onUndo).toHaveBeenCalledWith(PLAN_EXAM.id);
  });

  it('offers no way back once the action was taken back', () => {
    renderInApp(
      <Conversation
        messages={[buddySaid([{ ...PLAN_EXAM, status: 'undone' }])]}
        pending={null}
        busy={false}
        showActions
        onUndo={() => undefined}
      />,
    );
    expect(screen.queryByRole('button', { name: /Rückgängig machen/ })).toBeNull();
    // It still says what happened, now as something that was taken back.
    expect(screen.getByText(/zurückgenommen|rückgängig/i)).toBeTruthy();
  });
});

/** The element and every box above it, up to the document. */
function* ancestors(el: Element): Generator<Element> {
  for (let up: Element | null = el; up; up = up.parentElement) yield up;
}
