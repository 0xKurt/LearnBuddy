// The orb in the head follows what is happening on the screen (issue #179; owner rule 1, #599).

import { describe, expect, it } from 'vitest';

import { headState, practiceHeadState, type HeadFacts, type PracticeFacts } from '../headState.js';

const quiet: HeadFacts = { sending: false, working: false, streaming: false };

describe('what the head says Buddy is doing', () => {
  it('never shows idle while an answer is being written', () => {
    // The fault this fixes: `pending` is null again the moment streaming starts, so the
    // orb went back to idle at the busiest moment of the app.
    expect(headState({ ...quiet, streaming: true })).toBe('speak');
    expect(headState({ ...quiet, streaming: true, sending: false })).toBe('speak');
  });

  it('thinks from the sent message until the first word comes back', () => {
    expect(headState({ ...quiet, sending: true })).toBe('think');
    expect(headState({ ...quiet, working: true })).toBe('think');
  });

  it('puts what he does now over what he did a moment ago', () => {
    expect(headState({ ...quiet, working: true, streaming: true })).toBe('speak');
  });

  it('listens while a recording of hers runs on a card in the thread (the rehearsal)', () => {
    expect(headState({ ...quiet, recording: true })).toBe('listen');
    expect(headState({ ...quiet, recording: false })).toBe('idle');
    // What Buddy is doing still beats it.
    expect(headState({ ...quiet, recording: true, streaming: true })).toBe('speak');
  });

  it('listens while she writes or dictates (design App.jsx `typing`, decision on #599)', () => {
    expect(headState({ ...quiet, typing: true })).toBe('listen');
    // …but what Buddy himself is doing is the newer truth.
    expect(headState({ ...quiet, typing: true, sending: true })).toBe('think');
    expect(headState({ ...quiet, typing: true, streaming: true })).toBe('speak');
  });

  it('thinks while he reads a sheet she sent, and listens when she writes meanwhile', () => {
    expect(headState({ ...quiet, reading: true })).toBe('think');
    expect(headState({ ...quiet, reading: true, typing: true })).toBe('listen');
  });

  it('listens only when she is the one talking', () => {
    const all = [false, true].flatMap((sending) =>
      [false, true].flatMap((working) =>
        [false, true].flatMap((streaming) =>
          [false, true].map((reading) => headState({ sending, working, streaming, reading })),
        ),
      ),
    );
    expect(all).not.toContain('listen');
  });

  it('is idle when nothing is happening', () => {
    expect(headState(quiet)).toBe('idle');
  });
});

const task: PracticeFacts = {
  checking: false,
  open: true,
  fresh: false,
  afterCorrect: false,
  replying: false,
};

describe('what the head of a task shows (MIGRATION §6)', () => {
  it('waits while the task is open', () => {
    expect(practiceHeadState(task)).toBe('wait');
  });

  it('thinks while her answer is checked, open or not', () => {
    expect(practiceHeadState({ ...task, checking: true })).toBe('think');
    expect(practiceHeadState({ ...task, checking: true, open: false })).toBe('think');
  });

  it('celebrates a right answer that just came back, and only that', () => {
    const closed = { ...task, open: false };
    expect(practiceHeadState({ ...closed, fresh: true, afterCorrect: true })).toBe('happy');
    // Reopened later, or the reply to a wrong try: Buddy rests.
    expect(practiceHeadState({ ...closed, fresh: false, afterCorrect: true })).toBe('idle');
    expect(practiceHeadState({ ...closed, fresh: true, afterCorrect: false })).toBe('idle');
  });

  it('speaks while his feedback to a try that was not right yet is the newest thing on screen', () => {
    // Design ui_kits/app/App.jsx:62, Tasks.jsx:176: not right yet → speaking.
    expect(practiceHeadState({ ...task, fresh: true, replying: true })).toBe('speak');
    // …also on a task the try closed (the solution is shown with his words).
    expect(practiceHeadState({ ...task, open: false, fresh: true, replying: true })).toBe('speak');
  });

  it('waits again once she starts her next try, and thinks once it is sent', () => {
    expect(practiceHeadState({ ...task, fresh: true, replying: false })).toBe('wait');
    expect(practiceHeadState({ ...task, fresh: true, replying: true, checking: true })).toBe(
      'think',
    );
  });

  it('needs no word about a reply from a screen that has none (a round of Kopfrechnen)', () => {
    const round = { checking: false, open: true, fresh: false, afterCorrect: false };
    expect(practiceHeadState(round)).toBe('wait');
    expect(practiceHeadState({ ...round, open: false, fresh: true })).toBe('idle');
  });

  it('never speaks about a reply that was there when the screen opened', () => {
    expect(practiceHeadState({ ...task, fresh: false, replying: true })).toBe('wait');
  });

  it('listens while she says her answer, before anything else', () => {
    expect(practiceHeadState({ ...task, listening: true })).toBe('listen');
    expect(practiceHeadState({ ...task, listening: true, checking: true })).toBe('listen');
  });
});
