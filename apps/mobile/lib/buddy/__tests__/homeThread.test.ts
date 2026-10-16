import type { BuddyHome, MessageView } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { homeTop, type HomeLayout } from '../../homeLayout.js';
import { learningTop } from '../../learning/homeLayout.js';
import { greetingOnScreen, placeByTime, threadOnScreen, VISIBLE_MESSAGES } from '../homeThread.js';
import type { SessionStart } from '../useSessionStart.js';

// What the bar on top carries is the learning domain's (issue #107), filled as at app start.
homeTop.fill(learningTop);

const STEP = '00000000-0000-4000-8000-000000000001';
const SESSION = '00000000-0000-4000-8000-000000000002';
const AT = '2026-10-09T08:00:00.000Z';

type Action = MessageView['actions'][number];

function action(id: string, summary: Action['summary'], undoable = true): Action {
  return { id, status: 'applied', undoable, summary, created_at: AT };
}

function message(id: string, actions: Action[] = []): MessageView {
  return {
    id,
    role: 'buddy',
    text: id,
    status: 'done',
    failure_code: null,
    client_message_id: null,
    options: null,
    reply_to_id: null,
    outreach: null,
    actions,
    roleplay_feedback: null,
    created_at: AT,
  };
}

const home = (parts: Pick<BuddyHome, 'thread' | 'now'>) => parts as BuddyHome;

const layout = (parts: Partial<HomeLayout>): HomeLayout => ({
  bar: null,
  failed: false,
  result: false,
  decisionInline: false,
  working: null,
  photoAsk: 'thread',
  preparedIn: 'thread',
  ...parts,
});

const ask = action('a-ask', {
  tool: 'request_material',
  step_id: STEP,
  title: 'Arbeitsblatt',
  material_id: null,
});
const prepared = action('a-prep', {
  tool: 'prepare_practice',
  step_id: STEP,
  title: 'Brüche',
  question_count: 4,
  est_minutes: 5,
});

describe('what the home thread shows (issues #94, #204)', () => {
  it('shows the newest messages only', () => {
    const thread = Array.from({ length: VISIBLE_MESSAGES + 2 }, (_, i) => message(`m${i}`));
    const { messages } = threadOnScreen(home({ thread, now: null }), layout({}));
    expect(messages.map((m) => m.id)).toEqual(thread.slice(-VISIBLE_MESSAGES).map((m) => m.id));
  });

  it('leaves the photo ask to the capture bar, which carries its undo', () => {
    const now: BuddyHome['now'] = {
      type: 'capture_needed',
      step_id: STEP,
      title: 'Arbeitsblatt',
      goal: null,
      completes: null,
    };
    const h = home({ thread: [message('m1', [ask])], now });
    const onBar = threadOnScreen(h, layout({ bar: 'capture', photoAsk: 'bar' }));
    expect(onBar.messages[0]?.actions).toEqual([]);
    expect(onBar.captureUndo?.id).toBe('a-ask');
    // Bar closed: the receipt with its undo is the place again.
    const inThread = threadOnScreen(h, layout({ photoAsk: 'thread' }));
    expect(inThread.messages[0]?.actions).toEqual([ask]);
    expect(inThread.captureUndo).toBeNull();
  });

  it('carries the prepared practice on top while its bar stands', () => {
    const now: BuddyHome['now'] = {
      type: 'practice_ready',
      step_id: STEP,
      title: 'Brüche',
      question_count: 4,
      est_minutes: 5,
      focus_topics: [],
      goal: null,
    };
    const h = home({ thread: [message('m1', [prepared])], now });
    expect([...threadOnScreen(h, layout({ preparedIn: 'bar' })).carriedOnTop]).toEqual(['a-prep']);
    expect(threadOnScreen(h, layout({ preparedIn: 'thread' })).carriedOnTop.size).toBe(0);
  });
});

describe("Buddy's greeting on screen (issue #195)", () => {
  const now: BuddyHome['now'] = {
    type: 'practice_result',
    session_id: SESSION,
    mode: 'practice',
    result: { answered: 4, first_try: 4, secure_topics: [], shaky_topics: [] },
    next: null,
  };
  const start: SessionStart = {
    key: 'session.after.all_first',
    count: 4,
    tells: SESSION,
    part: 'morning',
    since: null,
    variant: 0,
    pending: false,
    afterMessageId: 'm1',
    text: 'Hallo',
  };

  it('stands under its message and carries the practice it names', () => {
    const g = greetingOnScreen(home({ thread: [message('m1')], now }), start);
    expect(g.shown).toBe(true);
    expect(g.result?.session_id).toBe(SESSION);
  });

  it('gives the result its card back once its message scrolled out of the window', () => {
    const thread = [
      message('m1'),
      ...Array.from({ length: VISIBLE_MESSAGES }, (_, i) => message(`n${i}`)),
    ];
    expect(greetingOnScreen(home({ thread, now }), start)).toEqual({ shown: false, result: null });
  });

  it('is nothing without a greeting', () => {
    expect(greetingOnScreen(home({ thread: [message('m1')], now }), null)).toEqual({
      shown: false,
      result: null,
    });
  });
});

describe('placeByTime (issue #630)', () => {
  const at = (id: string, created_at: string) => ({ id, created_at });
  const thread = [
    at('sheet', '2026-10-14T12:10:00.000Z'),
    at('hers', '2026-10-14T12:18:00.000Z'),
    at('buddy', '2026-10-14T12:18:30.000Z'),
  ];

  it('puts a finished practice at its moment, not under what she said later', () => {
    // The device: „Geschafft! 7 Fragen" stood under „Lass uns das Arbeitsblatt üben".
    const placed = placeByTime(thread, [{ item: 'result', at: '2026-10-14T12:12:00.000Z' }]);
    expect(placed.after.get('sheet')).toEqual(['result']);
    expect(placed.end).toEqual([]);
  });

  it('keeps what is about now, and what is newer than every message, at the end', () => {
    const placed = placeByTime(thread, [
      { item: 'working', at: null },
      { item: 'fresh', at: '2026-10-14T12:20:00.000Z' },
    ]);
    expect(placed.end).toEqual(['working', 'fresh']);
    expect(placed.after.size).toBe(0);
  });

  it('draws what is older than the screen at its top, never nowhere (#630 review)', () => {
    // The check-in after a test stood under every message for days. Its moment scrolled out of
    // the window: it stands above what is shown — History draws no notices, so dropping it would
    // leave her no way to answer it.
    const placed = placeByTime(thread, [{ item: 'checkin', at: '2026-10-10T00:00:00.000Z' }]);
    expect(placed.before).toEqual(['checkin']);
    expect(placed.end).toEqual([]);
  });
});
