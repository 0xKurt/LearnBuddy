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
});
