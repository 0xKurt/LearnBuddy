// The Probetest's review explains (issue #388, report „Hilfe und Fragen beim Üben" §3.2): under the
// solution of a question she did not get right stands its worked way, where one was prepared. A
// question she got right carries none, and nothing is made up where the server sent none.

import type { PracticeSummary, SessionItemView } from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { SessionSummary } from '../SessionSummary.js';

const row = (
  id: string,
  prompt: string,
  status: SessionItemView['status'],
  answer: string,
  explanation: string | null,
): SessionItemView =>
  ({
    item: { id, kind: 'short', prompt },
    status,
    attempts: 1,
    hints_used: 0,
    hints_left: 0,
    hint_available: false,
    hint_offered: false,
    reveal_available: false,
    deferred: false,
    answer,
    listen_transcript: null,
    explanation,
  }) as unknown as SessionItemView;

const SUMMARY: PracticeSummary = { answered: 3, first_try: 1, secure_topics: [], shaky_topics: [] };

describe('SessionSummary — the Probetest review', () => {
  it('explains a missed question with its worked way, and only that one', () => {
    renderInApp(
      <SessionSummary
        summary={SUMMARY}
        mode="test"
        review={[
          row('a', 'Was ist 3 · 4?', 'missed', '12', '3 Gruppen mit je 4: 4 + 4 + 4 = 12.'),
          row('b', 'Was ist 6 · 7?', 'correct', '42', '6 · 7 = 42, weil 6 · 7 = 7 · 6.'),
          row('c', 'Was ist 2 · 9?', 'missed', '18', null),
        ]}
      />,
    );
    expect(screen.getByText('3 Gruppen mit je 4: 4 + 4 + 4 = 12.')).toBeTruthy();
    expect(screen.queryByText('6 · 7 = 42, weil 6 · 7 = 7 · 6.')).toBeNull();
    expect(screen.getByText('Lösung: 18')).toBeTruthy();
  });

  it('passes factual open and revealed states into the grouped screen review without changing solutions', () => {
    renderInApp(
      <SessionSummary
        summary={SUMMARY}
        mode="test"
        ranOut
        review={[
          { ...row('open', 'Noch offen', 'open', '', null), answer: null },
          row('shown', 'Lösung angeschaut', 'revealed', '12', 'Drei Gruppen mit vier.'),
        ]}
      />,
    );
    // The state alone, at the row's end (design ui_kits/app/Done.jsx:36): no number before it.
    expect(screen.getByText('Nicht beantwortet')).toBeDefined();
    expect(screen.queryByText(/\d · /)).toBeNull();
    expect(screen.getByText('Lösung: 12')).toBeDefined();
    expect(screen.getByText('Drei Gruppen mit vier.')).toBeDefined();
    const paths = Array.from(document.querySelectorAll('svg path')).map((path) =>
      path.getAttribute('d'),
    );
    expect(paths).toContain('M12 7v5l3 2');
    expect(paths).toContain('M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z');
  });

  it('says the lead as one paragraph, sentence after sentence (Done.jsx:26)', () => {
    renderInApp(
      <SessionSummary
        summary={{
          answered: 4,
          first_try: 2,
          secure_topics: ['Brüche'],
          shaky_topics: ['Gleichungen', 'Terme'],
        }}
        mode="practice"
      />,
    );
    expect(screen.getAllByTestId('summary-lead')).toHaveLength(1);
    expect(screen.getByTestId('summary-lead').textContent).toBe(
      'Du hast 4 Fragen beantwortet. Heute ohne Tipp geschafft: Brüche. Schauen wir nochmal an: Gleichungen, Terme.',
    );
  });
});
