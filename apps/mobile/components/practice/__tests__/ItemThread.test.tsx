// The thread under a question: her answer and Buddy's reply. What is pinned here is the one
// difference a structured answer makes (issues #228–#230): her arrangement stands on the board,
// so the thread does not echo it — neither as a bubble nor while it is being sent — and only
// Buddy's reply, which says the verdict in words, stands there. Echoed, four pairs were a
// four-line bubble the room above the board could only show as a cut-off strip (#229, shot 39e).

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
  rubric: null,
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

  it('answers an explanation with the list of key points, never with a right/wrong chip (#236)', () => {
    const said = turn({ text: 'Mit Licht und aus CO2 und Wasser.', verdict: 'partially_correct' });
    const reply = turn({
      id: '00000000-0000-4000-8000-000000000003',
      role: 'tutor',
      text: 'Das trägt schon. Und wo in der Zelle passiert das?',
      rubric: {
        kind: 'explain',
        points: [
          { name: 'Licht als Energiequelle', met: true },
          { name: 'Ort: Chloroplast', met: false },
        ],
        spots: [],
      },
    });
    renderInApp(<ItemThread turns={[said, reply]} pending={null} />);
    expect(screen.queryByText('Fast')).toBeNull();
    // The state in words on every row, not in colour alone.
    expect(screen.getByLabelText('Licht als Energiequelle: drin')).toBeDefined();
    expect(screen.getByLabelText('Ort: Chloroplast: fehlt noch')).toBeDefined();
    expect(screen.getByText(reply.text)).toBeDefined();
  });

  it('shows an essay its places to improve as her own quotes (#258)', () => {
    const reply = turn({
      id: '00000000-0000-4000-8000-000000000004',
      role: 'tutor',
      text: 'Das liest sich schon rund.',
      rubric: {
        kind: 'text',
        points: [{ name: 'Absätze', met: true }],
        spots: [{ quote: 'Das ist so', tip: 'Begründe das mit einem Beispiel.' }],
      },
    });
    renderInApp(<ItemThread turns={[ANSWER, reply]} pending={null} />);
    expect(screen.getByText('Hier kannst du noch feilen')).toBeDefined();
    expect(screen.getByText('„Das ist so“')).toBeDefined();
    expect(screen.getByText('Begründe das mit einem Beispiel.')).toBeDefined();
  });
});
