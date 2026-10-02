import type { NowCard } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { summaryLines } from '../../practice/summaryLine.js';
import {
  dayPart,
  greetingRoom,
  greetingVariant,
  openGreeting,
  refineGreeting,
  SESSION_GAP_MS,
  sessionGreeting,
  startsNewSession,
} from '../sessionAnchor.js';

const at = (iso: string) => new Date(iso);
const SESSION = '00000000-0000-4000-8000-000000000001';

describe('startsNewSession', () => {
  it('is a new page after a long break', () => {
    expect(
      startsNewSession({
        lastMessageAt: at('2026-09-28T08:00:00Z'),
        now: at('2026-09-28T13:00:00Z'),
        coldStart: false,
      }),
    ).toBe(true);
  });

  it('keeps the same page while she is still in it', () => {
    expect(
      startsNewSession({
        lastMessageAt: at('2026-09-28T12:30:00Z'),
        now: at('2026-09-28T13:00:00Z'),
        coldStart: false,
      }),
    ).toBe(false);
    // Exactly at the gap it starts — one rule, no grey zone.
    const last = at('2026-09-28T09:00:00Z');
    expect(
      startsNewSession({
        lastMessageAt: last,
        now: new Date(last.getTime() + SESSION_GAP_MS),
        coldStart: false,
      }),
    ).toBe(true);
  });

  it('says no for an empty conversation (the first visit has its own screen)', () => {
    expect(
      startsNewSession({ lastMessageAt: null, now: at('2026-09-28T13:00:00Z'), coldStart: true }),
    ).toBe(false);
  });

  it('starts a session on the app’s own start, whatever the clock says (issue #104)', () => {
    // She closed the app and opened it again a minute later: a new session all the same.
    expect(
      startsNewSession({
        lastMessageAt: at('2026-09-28T12:59:00Z'),
        now: at('2026-09-28T13:00:00Z'),
        coldStart: true,
      }),
    ).toBe(true);
  });

  it('does not start one for a look at the phone (back from the background)', () => {
    // Same minute, same running app: no greeting — that would come with every glance.
    expect(
      startsNewSession({
        lastMessageAt: at('2026-09-28T12:59:00Z'),
        now: at('2026-09-28T13:00:00Z'),
        coldStart: false,
      }),
    ).toBe(false);
  });
});

describe('greetingRoom', () => {
  it('gives the greeting the view, less what the list adds under it', () => {
    // 740 tall view, 8 of bottom padding: the block that puts the greeting on top is 732.
    expect(greetingRoom(740, 8)).toBe(732);
  });

  it('asks for nothing before the view is measured', () => {
    expect(greetingRoom(0, 8)).toBe(0);
  });

  it('never asks for a negative height', () => {
    expect(greetingRoom(4, 8)).toBe(0);
  });
});

describe('dayPart', () => {
  it('splits the day the way people talk about it', () => {
    expect([5, 8, 10].map(dayPart)).toEqual(['morning', 'morning', 'morning']);
    expect([11, 14, 16].map(dayPart)).toEqual(['day', 'day', 'day']);
    expect([17, 20, 21].map(dayPart)).toEqual(['evening', 'evening', 'evening']);
    expect([22, 0, 4].map(dayPart)).toEqual(['night', 'night', 'night']);
  });
});

describe('greetingVariant', () => {
  it('rotates and never leaves the range', () => {
    expect([0, 1, 2, 3, 4].map(greetingVariant)).toEqual([0, 1, 2, 0, 1]);
    expect(greetingVariant(-1)).toBe(2);
  });
});

describe('sessionGreeting (issue #195)', () => {
  const result = (
    over: Partial<{ answered: number; first_try: number }> & {
      mode?: 'practice' | 'test' | 'help';
    } = {},
  ): Extract<NowCard, { type: 'practice_result' }> => ({
    type: 'practice_result',
    session_id: SESSION,
    mode: over.mode ?? 'practice',
    result: {
      answered: over.answered ?? 6,
      first_try: over.first_try ?? 2,
      secure_topics: [],
      shaky_topics: [],
    },
    next: null,
  });

  it('is only a hello when nothing just happened', () => {
    expect(sessionGreeting('day', 1, null)).toEqual({ key: 'session.day.1', tells: null });
  });

  it('is only a hello over anything that is not a finished practice', () => {
    const ready: NowCard = {
      type: 'practice_ready',
      step_id: '00000000-0000-4000-8000-000000000002',
      title: 'Mathearbeit Brüche',
      question_count: 4,
      est_minutes: 5,
      focus_topics: [],
      goal: null,
    };
    expect(sessionGreeting('morning', 0, ready)).toEqual({
      key: 'session.morning.0',
      tells: null,
    });
  });

  it('names what she just did, and says which session it told about', () => {
    // The owner's screenshot: "Hi, Lienne!" with a flat "Done! You answered 6 questions."
    // under it. One sentence now, and the card knows not to repeat it.
    expect(sessionGreeting('day', 0, result({ answered: 6, first_try: 2 }))).toEqual({
      key: 'session.after.practice',
      count: 6,
      tells: SESSION,
    });
  });

  it('praises only a whole round right at once (CLAUDE.md rule 5)', () => {
    // Six answered, four of them wrong: "stark!" would be a lie she notices.
    expect(sessionGreeting('day', 0, result({ answered: 6, first_try: 2 })).key).toBe(
      'session.after.practice',
    );
    expect(sessionGreeting('day', 0, result({ answered: 6, first_try: 6 })).key).toBe(
      'session.after.all_first',
    );
    // One short of the whole round is not the whole round.
    expect(sessionGreeting('day', 0, result({ answered: 6, first_try: 5 })).key).toBe(
      'session.after.practice',
    );
  });

  it('says exactly what the summary is allowed to say', () => {
    // One rule for both, not two that drift (lib/practice/summaryLine.ts): the greeting
    // praises the round at once exactly where the summary's own lines do.
    for (const mode of ['practice', 'test', 'help'] as const)
      for (const answered of [1, 2, 6])
        for (const firstTry of [0, 1, answered]) {
          const now = result({ answered, first_try: firstTry, mode });
          const summaryPraises = summaryLines(now.result, mode).some((l) =>
            l.key.includes('first'),
          );
          expect(
            sessionGreeting('day', 0, now).key === 'session.after.all_first',
            `${mode} ${firstTry}/${answered}`,
          ).toBe(summaryPraises);
        }
  });

  it('never praises a test, where nothing was judged in front of her', () => {
    expect(sessionGreeting('day', 0, result({ answered: 4, first_try: 4, mode: 'test' })).key).toBe(
      'session.after.practice',
    );
  });

  it('says of homework what she solved herself', () => {
    expect(
      sessionGreeting('evening', 2, result({ answered: 3, first_try: 0, mode: 'help' })),
    ).toEqual({ key: 'session.after.help', count: 3, tells: SESSION });
  });

  it('greets plainly after a session she left without answering anything', () => {
    // Nothing to tell about, and nothing to suppress: there is no result card either.
    expect(sessionGreeting('night', 1, result({ answered: 0, first_try: 0 }))).toEqual({
      key: 'session.night.1',
      tells: null,
    });
  });
});

describe('the greeting and the copy kept on the device (issue #195)', () => {
  const done: Extract<NowCard, { type: 'practice_result' }> = {
    type: 'practice_result',
    session_id: SESSION,
    mode: 'practice',
    result: { answered: 4, first_try: 4, secure_topics: [], shaky_topics: [] },
    next: null,
  };

  it('is settled at once when the home came from the server', () => {
    const g = openGreeting('day', 0, done, true);
    expect(g).toMatchObject({ key: 'session.after.all_first', count: 4, tells: SESSION });
    expect(g.pending).toBe(false);
    // Nothing left to take up: the refinement is a no-op.
    expect(refineGreeting(g, done, true)).toEqual(g);
  });

  it('waits for the server when the home is the kept copy (which has no "now")', () => {
    // lib/api/deviceCache.ts strips everything that claims "now" (rule 5), so the instant
    // sentence cannot see the practice — it must be allowed to take it up afterwards.
    const opened = openGreeting('night', 1, null, false);
    expect(opened).toMatchObject({ key: 'session.night.1', tells: null, pending: true });
    const refined = refineGreeting(opened, done, true);
    expect(refined).toMatchObject({
      key: 'session.after.all_first',
      count: 4,
      tells: SESSION,
      pending: false,
    });
  });

  it('refines once and then never again', () => {
    const refined = refineGreeting(openGreeting('night', 1, null, false), done, true);
    // A later home with nothing to say does not undo the sentence.
    expect(refineGreeting(refined, null, true)).toEqual(refined);
    // Nor does another practice replace it: this greeting is settled.
    const other = { ...done, session_id: '00000000-0000-4000-8000-00000000beef' };
    expect(refineGreeting(refined, other, true)).toEqual(refined);
  });

  it('keeps the plain hello when the server has nothing to add', () => {
    const opened = openGreeting('morning', 2, null, false);
    const settled = refineGreeting(opened, null, true);
    expect(settled).toMatchObject({ key: 'session.morning.2', tells: null, pending: false });
  });

  it('does not rewrite a sentence she has already answered', () => {
    // Something has been said since the greeting: a line above her own message must not
    // change under her, however true the new wording would be.
    const opened = openGreeting('day', 0, null, false);
    expect(refineGreeting(opened, done, false)).toMatchObject({
      key: 'session.day.0',
      tells: null,
      pending: false,
    });
  });
});
