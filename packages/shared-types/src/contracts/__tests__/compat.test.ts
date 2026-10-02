// Older app builds keep reading the home after the API grows (audit M-69
// p2-closed-contracts-break-old-apps-on-additive-api-change).
import { describe, expect, it } from 'vitest';

import { BuddyHome } from '../buddy.js';
import { ItemView } from '../learning.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-09-28T10:00:00.000Z';

const message = (n: number, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  role: 'buddy',
  text: `Nachricht ${n}`,
  status: 'done',
  client_message_id: null,
  options: null,
  reply_to_id: null,
  outreach: null,
  actions: [],
  created_at: at,
  ...extra,
});

const home = (extra: Record<string, unknown> = {}) => ({
  learner: { id: id(1), name: 'Lena', is_minor: true },
  now: null,
  notice: null,
  decision: null,
  done: [],
  next: [],
  thread: [message(2)],
  thread_has_more: false,
  system: { model: true, push: 'disabled', contact_enabled: false, scheduler: 'ok' },
  working: null,
  context_version: 3,
  ...extra,
});

describe('BuddyHome is forward compatible', () => {
  it('reads a home as it is today', () => {
    expect(BuddyHome.safeParse(home()).success).toBe(true);
  });

  it('skips a card, notice or decision kind this build does not know', () => {
    const r = BuddyHome.parse(
      home({
        now: { type: 'quiz_night', id: id(9) },
        notice: { type: 'new_notice' },
        decision: { type: 'new_question' },
      }),
    );
    expect(r.now).toBeNull();
    expect(r.notice).toBeNull();
    expect(r.decision).toBeNull();
  });

  it('keeps the thread when one message carries a new tool or status', () => {
    const action = {
      id: id(20),
      status: 'applied',
      undoable: false,
      summary: { tool: 'plan_trip', where: 'Zoo' },
      created_at: at,
    };
    const r = BuddyHome.parse(
      home({
        thread: [
          message(2, { actions: [action] }),
          message(3, { status: 'thinking_hard' }),
          message(4, {
            outreach: {
              id: id(30),
              kind: 'idea',
              origin: 'buddy',
              title: 't',
              body: 'b',
              why: null,
              status: 'delivered_somehow',
              send_at: null,
              sent_at: null,
              opened_at: null,
              created_at: at,
            },
          }),
        ],
        done: [action],
      }),
    );
    expect(r.thread.map((m) => m.text)).toEqual(['Nachricht 2', 'Nachricht 4']);
    expect(r.thread[0]?.actions).toEqual([]);
    expect(r.thread[1]?.outreach).toBeNull();
    expect(r.done).toEqual([]);
  });

  it('reads an unknown system state as the calmest known one', () => {
    const r = BuddyHome.parse(
      home({
        system: { model: true, push: 'carrier_pigeon', contact_enabled: true, scheduler: 'warp' },
        working: 'voice',
      }),
    );
    expect(r.system).toMatchObject({ push: 'disabled', scheduler: 'unknown' });
    expect(r.working).toBeNull();
  });
});

describe('ItemView reads pictures as options (issue #231)', () => {
  const item = (extra: Record<string, unknown> = {}) => ({
    id: id(40),
    kind: 'multiple_choice',
    prompt: 'Welcher Graph passt?',
    choices: ['a', 'b'],
    unit: null,
    topic: null,
    origin: 'buddy',
    lang: null,
    prompt_lang: 'de',
    figure: null,
    ...extra,
  });
  const plot = {
    type: 'function_plot',
    functions: [{ expr: 'x', label: null }],
    x_min: -1,
    x_max: 1,
    y_min: -1,
    y_max: 1,
    points: [],
  };

  it('reads a question from a server that does not send them yet as one without pictures', () => {
    expect(ItemView.parse(item()).choice_figures).toBeNull();
  });

  it('reads the pictures', () => {
    expect(ItemView.parse(item({ choice_figures: [plot, plot] })).choice_figures).toHaveLength(2);
  });

  it('keeps the question when a picture is of a kind this build does not know', () => {
    const r = ItemView.parse(item({ choice_figures: [plot, { type: 'hologram' }] }));
    expect(r.choice_figures).toBeNull();
    expect(r.choices).toEqual(['a', 'b']);
  });
});
