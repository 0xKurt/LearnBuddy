// Buddy's feedback on her long text (issue #258), in his reply bubble in the thread: each key point
// with a calm state in words, her own words marked as hers, three places to improve, and the next
// step. No score, no grade, no "falsch". Her versions stand as one line each, not as the whole text.

import type {
  EssayFeedback as Feedback,
  PracticeTurnView,
} from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { EssayFeedback } from '../EssayFeedback.js';
import { ItemThread } from '../ItemThread.js';

const FEEDBACK: Feedback = {
  form: 'Erörterung',
  points: [
    { name: 'Einleitung', state: 'met', quote: 'Viele Schulen verbieten Handys.', missing: null },
    {
      name: 'Gegenargument',
      state: 'open',
      quote: null,
      missing: 'Nimm ein Gegenargument auf und wäge es gegen deine Seite ab.',
    },
    { name: 'Präsens', state: 'unknown', quote: null, missing: null },
  ],
  places: [
    { quote: 'Handys lenken ab.', better: 'Belege das mit einem Beispiel.' },
    { quote: 'Das ist so.', better: 'Begründe, warum.' },
  ],
  last: false,
};

describe('feedback on a long text (#258)', () => {
  it('names each judged point with a sign and a word, never a colour alone', () => {
    renderInApp(<EssayFeedback feedback={FEEDBACK} />);
    expect(screen.getByText('Erörterung – so steht dein Text')).toBeDefined();
    expect(screen.getAllByTestId('essay-point')).toHaveLength(2);
    expect(screen.getByText('Einleitung')).toBeDefined();
    expect(screen.getByText('geschafft')).toBeDefined();
    expect(screen.getByText('noch offen')).toBeDefined();
    expect(screen.getByText(FEEDBACK.points[1]!.missing!)).toBeDefined();
    // A point without a judgement is not shown at all.
    expect(screen.queryByText('Präsens')).toBeNull();
  });

  it('marks her quoted words as hers', () => {
    renderInApp(<EssayFeedback feedback={FEEDBACK} />);
    expect(screen.getByText('„Viele Schulen verbieten Handys.“')).toBeDefined();
    expect(screen.getByLabelText('Deine Worte: „Handys lenken ab.“')).toBeDefined();
    expect(screen.getAllByTestId('essay-place')).toHaveLength(2);
    expect(screen.getByText('Belege das mit einem Beispiel.')).toBeDefined();
  });

  it('says what comes next: revise from the text in the field, or that this was the last', () => {
    const { unmount } = renderInApp(<EssayFeedback feedback={FEEDBACK} />);
    expect(screen.getByText(/dein Text steht noch im Feld/)).toBeDefined();
    unmount();
    renderInApp(<EssayFeedback feedback={{ ...FEEDBACK, last: true }} />);
    expect(screen.getByText(/letzte Fassung/)).toBeDefined();
  });

  it('has no number, no grade and no "falsch" in it', () => {
    const { container } = renderInApp(<EssayFeedback feedback={FEEDBACK} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/falsch|Note|Punkte/i);
  });
});

const turn = (over: Partial<PracticeTurnView>): PracticeTurnView => ({
  id: '00000000-0000-4000-8000-000000000001',
  item_id: '00000000-0000-4000-8000-0000000000aa',
  role: 'learner',
  text: '',
  verdict: null,
  pronunciation: null,
  reexplain: null,
  essay: null,
  created_at: '2026-10-04T09:00:00.000Z',
  ...over,
});

describe('a long text in the thread (#258)', () => {
  const TEXT = 'Viele Schulen verbieten Handys. Handys lenken ab. Das ist so.';
  const VERSION = turn({ text: TEXT, verdict: 'not_an_attempt' });
  const REPLY = turn({
    id: '00000000-0000-4000-8000-000000000002',
    role: 'tutor',
    text: 'Erörterung – so steht dein Text: ✓ Einleitung · Gegenargument fehlt noch',
    essay: FEEDBACK,
  });

  it('stands as one line per version, and the feedback in Buddy’s bubble', () => {
    renderInApp(<ItemThread turns={[VERSION, REPLY]} pending={null} essay />);
    expect(screen.getByText('Fassung 1 · 10 Wörter')).toBeDefined();
    expect(screen.queryByText(TEXT)).toBeNull();
    expect(screen.getByTestId('essay-feedback')).toBeDefined();
    // A screen reader hears Buddy's whole sentence, as for every reply.
    expect(screen.getByLabelText(`Buddy: ${REPLY.text}`)).toBeDefined();
  });

  it('while it is on its way, says her text and that Buddy is reading it', () => {
    renderInApp(<ItemThread turns={[]} pending={TEXT} essay />);
    expect(screen.getByText('Dein Text · 10 Wörter')).toBeDefined();
    expect(screen.getByText('Buddy liest deinen Text …')).toBeDefined();
  });

  it('keeps her question about her text as her words, and an unread text is "Dein Text"', () => {
    // Her question to the tutor (#402) and a version Buddy could not read (no verdict, outage).
    const QUESTION = turn({
      id: '00000000-0000-4000-8000-000000000003',
      text: 'Ist meine Einleitung zu lang?',
      verdict: 'not_an_attempt',
    });
    const UNREAD = turn({ id: '00000000-0000-4000-8000-000000000004', text: TEXT });
    renderInApp(<ItemThread turns={[VERSION, REPLY, QUESTION, UNREAD]} pending={null} essay />);
    expect(screen.getByText('Fassung 1 · 10 Wörter')).toBeDefined();
    expect(screen.getByText('Ist meine Einleitung zu lang?')).toBeDefined();
    expect(screen.getByText('Dein Text · 10 Wörter')).toBeDefined();
  });

  it('shows a question on its way as she wrote it', () => {
    renderInApp(<ItemThread turns={[VERSION, REPLY]} pending="Was fehlt noch?" asking essay />);
    expect(screen.getByText('Was fehlt noch?')).toBeDefined();
    // Buddy thinks about her question; he is not reading her text again.
    expect(screen.queryByText('Buddy liest deinen Text …')).toBeNull();
  });
});
