// The thread under a question: her answer and Buddy's reply. What is pinned here is the one
// difference a structured answer makes (issues #228–#230): her arrangement stands on the board,
// so the thread does not echo it — neither as a bubble nor while it is being sent — and only
// Buddy's reply, which says the verdict in words, stands there. Echoed, four pairs were a
// four-line bubble the room above the board could only show as a cut-off strip (#229, shot 39e).

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { ItemThread } from '../ItemThread.js';

const turn = (over: Partial<PracticeTurnView>): PracticeTurnView => ({
  id: '00000000-0000-4000-8000-000000000001',
  item_id: '00000000-0000-4000-8000-0000000000aa',
  role: 'learner',
  text: '',
  verdict: null,
  pronunciation: null,
  reexplain: null,
  created_at: '2026-10-02T15:00:00.000Z',
  ...over,
});

const ANSWER = turn({
  text: 'Bundespräsident – unterschreibt die neuen Gesetze; Bundesrat – vertritt die Länder',
  verdict: 'incorrect',
});
const REPLY = turn({
  id: '00000000-0000-4000-8000-000000000002',
  role: 'tutor',
  text: '2 von 4 Paaren stimmen schon.',
});

describe('the thread under a question', () => {
  it('echoes an ordinary answer with its verdict', () => {
    renderInApp(<ItemThread turns={[ANSWER, REPLY]} pending={null} />);
    expect(screen.getByText(ANSWER.text)).toBeDefined();
    expect(screen.getByText('Noch nicht ganz')).toBeDefined();
    expect(screen.getByText(REPLY.text)).toBeDefined();
  });

  it('does not echo a structured answer: only the reply stands there', () => {
    renderInApp(<ItemThread turns={[ANSWER, REPLY]} pending={null} echoAnswers={false} />);
    expect(screen.queryByText(ANSWER.text)).toBeNull();
    expect(screen.queryByText('Noch nicht ganz')).toBeNull();
    expect(screen.getByText(REPLY.text)).toBeDefined();
  });

  it('does not show it while it is sent either, only that Buddy is looking', () => {
    renderInApp(<ItemThread turns={[]} pending={ANSWER.text} echoAnswers={false} />);
    expect(screen.queryByText(ANSWER.text)).toBeNull();
  });
});

// Her question to the tutor (issue #402): on a board or under options her answers are not echoed,
// but what she asked is her words, not an answer — it stands in the thread. A reply that offers
// to keep an off-topic question carries the chip "Merk ich mir für nachher"; once kept, "Gemerkt".
const QUESTION = turn({ text: 'Was ist ein Bundesrat?', verdict: 'not_an_attempt' });
const OFFER = turn({
  id: '00000000-0000-4000-8000-000000000003',
  role: 'tutor',
  text: 'Gute Frage – lass uns erst die Aufgabe lösen.',
  later: 'offered',
});

describe('a question she asked about the task', () => {
  it('stands in the thread where answers are not echoed', () => {
    renderInApp(
      <ItemThread turns={[ANSWER, QUESTION, REPLY]} pending={null} echoAnswers={false} />,
    );
    expect(screen.queryByText(ANSWER.text)).toBeNull();
    expect(screen.getByText(QUESTION.text)).toBeDefined();
  });

  it('shows while it is sent, and Buddy thinks about a question', () => {
    renderInApp(<ItemThread turns={[]} pending={QUESTION.text} asking echoAnswers={false} />);
    expect(screen.getByText(QUESTION.text)).toBeDefined();
    expect(screen.getByText('Buddy denkt über deine Frage nach …')).toBeDefined();
  });

  it('offers "Merk ich mir für nachher" on a reply that offers it, and keeps that turn', () => {
    const onKeep = vi.fn();
    renderInApp(
      <ItemThread turns={[QUESTION, OFFER]} pending={null} later={{ onKeep, disabled: false }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Merk ich mir für nachher' }));
    expect(onKeep).toHaveBeenCalledWith(OFFER.id);
  });

  it('says "Gemerkt" once kept, and offers nothing on another reply', () => {
    renderInApp(
      <ItemThread
        turns={[QUESTION, { ...OFFER, later: 'kept' }, REPLY]}
        pending={null}
        later={{ onKeep: () => undefined, disabled: false }}
      />,
    );
    expect(screen.getByText('Gemerkt')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Merk ich mir für nachher' })).toBeNull();
  });
});
