// What the practice screen shows about the question on screen (`questionView`, issue #311): read
// off the session the server sent, nothing guessed by the app.

import type {
  PracticeTurnView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { questionView } from '../questionView.js';

// Only what `questionView` reads: the questions, their status and kind, and the turns.
const question = (id: string, status: string, kind = 'short') =>
  ({ item: { id, kind }, status }) as unknown as SessionItemView;

let seq = 0;
const turn = (
  itemId: string,
  role: 'learner' | 'tutor',
  text: string,
  over: { verdict?: string; reexplain?: string } = {},
) =>
  ({
    id: `t${++seq}`,
    item_id: itemId,
    role,
    text,
    verdict: over.verdict ?? null,
    reexplain: over.reexplain ?? null,
  }) as unknown as PracticeTurnView;

const session = (items: SessionItemView[], turns: PracticeTurnView[], preparing = false) =>
  ({ items, turns, preparing }) as unknown as SessionView;

describe('the question on screen', () => {
  it('holds its own turns only, the "Anders erklären" exchanges apart', () => {
    const a = question('a', 'incorrect');
    const tries = [turn('a', 'learner', '3', { verdict: 'incorrect' }), turn('a', 'tutor', 'Fast')];
    const again = turn('a', 'tutor', 'Anders gesagt …', { reexplain: 'simpler' });
    const other = turn('b', 'learner', '7');
    const view = questionView(
      session([a, question('b', 'open')], [...tries, again, other]),
      a,
      null,
    );
    expect(view.turns).toEqual(tries);
    expect(view.threadTurns).toEqual(tries);
    expect(view.turnsAgain).toEqual([again]);
    expect(view.open).toBe(false);
    // Closed: its newest part (the solution) stays in view.
    expect(view.followEnd).toBe(true);
  });

  it('remembers the options she tried and got wrong — not the right one, not Buddy’s words', () => {
    const a = question('a', 'open');
    const view = questionView(
      session(
        [a],
        [
          turn('a', 'learner', 'Berlin', { verdict: 'incorrect' }),
          turn('a', 'tutor', 'Hamburg?'),
          turn('a', 'learner', 'Bonn', { verdict: 'partially_correct' }),
        ],
      ),
      a,
      null,
    );
    expect([...view.tried]).toEqual(['Berlin']);
  });

  it('shows a Diktat from her latest try on (issue #242)', () => {
    const a = question('a', 'open', 'spelling_dictation');
    const first = [turn('a', 'learner', 'Fahrad'), turn('a', 'tutor', 'Fast')];
    const latest = [turn('a', 'learner', 'Fahrrad'), turn('a', 'tutor', 'Genau')];
    const view = questionView(session([a], [...first, ...latest]), a, null);
    expect(view.threadTurns).toEqual(latest);
    expect(view.turns).toEqual([...first, ...latest]);
    expect(view.dictationCompact).toBe(true);
  });

  it('counts what is on its way for this question only', () => {
    const a = question('a', 'open');
    const quiet = questionView(session([a], []), a, { itemId: 'b', text: '4' });
    expect(quiet.pendingText).toBeNull();
    expect(quiet.dictationCompact).toBe(false);
    expect(quiet.followEnd).toBe(false);
    const sent = questionView(session([a], []), a, { itemId: 'a', text: '4' });
    expect(sent.pendingText).toBe('4');
    expect(sent.dictationCompact).toBe(true);
    expect(sent.followEnd).toBe(true);
  });

  it('says where she is in the server’s words, also while more questions are coming (#220)', () => {
    const b = question('b', 'open');
    const run = session([question('a', 'correct'), b, question('c', 'open')], [], true);
    expect(questionView(run, b, null).progress).toEqual({
      position: 2,
      total: 3,
      closed: 1,
      preparing: true,
    });
  });
});
