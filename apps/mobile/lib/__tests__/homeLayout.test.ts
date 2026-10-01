import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { followsEnd, homeLayout, topKey } from '../homeLayout.js';

type Parts = Pick<BuddyHome, 'now' | 'decision' | 'working'>;

const capture: NonNullable<BuddyHome['now']> = {
  type: 'capture_needed',
  step_id: '00000000-0000-4000-8000-000000000001',
  title: 'Arbeitsblatt Brüche',
  goal: null,
  completes: null,
};
const reading: NonNullable<BuddyHome['now']> = {
  type: 'material_processing',
  material_id: '00000000-0000-4000-8000-000000000002',
  status: 'processing',
};
const failed: NonNullable<BuddyHome['now']> = {
  type: 'material_failed',
  material_id: '00000000-0000-4000-8000-000000000005',
  reason: 'unreadable',
  retryable: true,
  purpose: 'study',
  completes: null,
  title: null,
};
const prepared = {
  step_id: '00000000-0000-4000-8000-000000000003',
  title: 'Mathearbeit Brüche',
  question_count: 4,
  est_minutes: 5,
  focus_topics: [],
  goal: null,
};
const result: NonNullable<BuddyHome['now']> = {
  type: 'practice_result',
  session_id: '00000000-0000-4000-8000-000000000006',
  mode: 'practice',
  result: { answered: 4, first_try: 4, secure_topics: [], shaky_topics: [] },
  next: null,
};
const optIn: NonNullable<BuddyHome['decision']> = {
  type: 'contact_opt_in',
  can_enable_here: false,
  rules: { quiet_start: '20:00' },
};

describe('home layout (user feedback #6, issue #17)', () => {
  it('has at most one slim bar on top; the opt-in is asked in the chat', () => {
    // Lena's crowded home (p2-04): "Schick mir ein Foto" and "Darf ich dir
    // Benachrichtigungen aufs Handy schicken?" both on top, each with a violet button.
    const l = homeLayout({ now: capture, decision: optIn, working: null } satisfies Parts);
    expect(l).toEqual({
      bar: 'capture',
      failed: false,
      result: false,
      decisionInline: true,
      working: null,
      photoAsk: 'bar',
    });
  });

  it('never puts the decision on top: alone it is still asked in the conversation', () => {
    const l = homeLayout({ now: null, decision: optIn, working: null });
    expect(l.bar).toBeNull();
    expect(l.decisionInline).toBe(true);
    expect(homeLayout({ now: null, decision: null, working: null }).bar).toBeNull();
  });

  it('gives each acting card its bar: resume, ready, capture, reading', () => {
    const resume: NonNullable<BuddyHome['now']> = {
      type: 'resume_practice',
      session_id: '00000000-0000-4000-8000-000000000007',
      mode: 'help',
      title: 'Hausaufgabe Quadrat',
      remaining: 2,
    };
    expect(homeLayout({ now: resume, decision: null, working: null }).bar).toBe('resume');
    expect(
      homeLayout({ now: { type: 'practice_ready', ...prepared }, decision: null, working: null })
        .bar,
    ).toBe('ready');
    expect(homeLayout({ now: capture, decision: null, working: null }).bar).toBe('capture');
    expect(homeLayout({ now: reading, decision: null, working: null }).bar).toBe('reading');
  });

  it('tells a failed sheet in the conversation, never on top', () => {
    const l = homeLayout({ now: failed, decision: null, working: null });
    expect(l.bar).toBeNull();
    expect(l.failed).toBe(true);
    // Nothing on top means nothing to close.
    expect(topKey({ now: failed })).toBeNull();
  });

  it('tells a result in the conversation; what is prepared next is the bar (no sub-card)', () => {
    const alone = homeLayout({ now: result, decision: null, working: null });
    expect(alone).toMatchObject({ bar: null, result: true });
    const withNext = homeLayout({
      now: { ...result, next: prepared },
      decision: null,
      working: null,
    });
    expect(withNext).toMatchObject({ bar: 'next', result: true });
  });

  it('asks for the photo once: the bar carries it, else the receipt in the chat (issue #94)', () => {
    // 05-buddy-planned: "Schick mir ein Foto" stood three times — the card, Buddy's
    // sentence, and the word-for-word "✓ Ich warte auf dein Foto" receipt below it.
    expect(homeLayout({ now: capture, decision: null, working: null }).photoAsk).toBe('bar');
    // No capture bar (nothing, or another bar): the receipt stays the place for ask and undo.
    expect(homeLayout({ now: null, decision: null, working: null }).photoAsk).toBe('thread');
    expect(homeLayout({ now: reading, decision: null, working: null }).photoAsk).toBe('thread');
  });

  it('says "working" once: inside "Ich lese dein Blatt", else at the end of the chat', () => {
    // p2-08: "Ich lese dein Blatt …" and "Ich mache aus deinem Blatt gerade Übungen …" stacked.
    expect(homeLayout({ now: reading, decision: null, working: 'material' }).working).toBe('bar');
    expect(homeLayout({ now: capture, decision: null, working: 'material' }).working).toBe(
      'thread',
    );
    expect(homeLayout({ now: null, decision: null, working: 'session' })).toMatchObject({
      bar: null,
      working: 'thread',
    });
  });
});

describe('the bar on top, closed on this phone (it lies over the menu)', () => {
  const ready: NonNullable<BuddyHome['now']> = { type: 'practice_ready', ...prepared };
  const ok = { model: true, scheduler: 'ok' } as const;

  it('stays closed while the bar says the same, and comes back when it says something new', () => {
    const closed = topKey({ now: ready, system: ok });
    expect(closed).not.toBeNull();
    expect(homeLayout({ now: ready, decision: null, working: null }, closed).bar).toBeNull();
    // Another practice is ready: shown again.
    const other = { ...ready, step_id: '00000000-0000-4000-8000-000000000004' };
    expect(homeLayout({ now: other, decision: null, working: null }, closed).bar).toBe('ready');
    // The same practice, now with fewer questions: something new, shown again.
    expect(
      homeLayout({ now: { ...ready, question_count: 3 }, decision: null, working: null }, closed)
        .bar,
    ).toBe('ready');
  });

  it('closing the bar of what is next leaves the result in the conversation', () => {
    const withNext: NonNullable<BuddyHome['now']> = { ...result, next: prepared };
    const closed = topKey({ now: withNext });
    expect(closed).not.toBeNull();
    expect(homeLayout({ now: withNext, decision: null, working: null }, closed)).toMatchObject({
      bar: null,
      result: true,
    });
  });

  it('decisions have no key on top: they are conversation, not a card to close', () => {
    expect(topKey({ now: null })).toBeNull();
    const l = homeLayout({ now: null, decision: optIn, working: null }, null);
    expect(l.decisionInline).toBe(true);
  });

  it('hands the photo ask back to the receipt when the capture bar is closed (issue #94)', () => {
    const closed = topKey({ now: capture });
    expect(closed).not.toBeNull();
    const l = homeLayout({ now: capture, decision: null, working: null }, closed);
    expect(l.bar).toBeNull();
    expect(l.photoAsk).toBe('thread');
  });

  it('says "working" in the conversation when "Ich lese dein Blatt" is closed', () => {
    const closed = topKey({ now: reading });
    expect(homeLayout({ now: reading, decision: null, working: 'material' }, closed).working).toBe(
      'thread',
    );
  });

  it('has a key for the system notes alone, and none when nothing is on top', () => {
    expect(topKey({ now: null, system: ok })).toBeNull();
    expect(topKey({ now: null, system: { model: false, scheduler: 'ok' } })).not.toBeNull();
    // A note that comes up changes what is on top: shown again.
    expect(topKey({ now: ready, system: { model: true, scheduler: 'stale' } })).not.toBe(
      topKey({ now: ready, system: ok }),
    );
  });
});

describe('where the conversation stands', () => {
  it('follows the newest message while she is at the end', () => {
    // Buddy's newer replies ("Übungen vorbereitet …") and his question at the end come into
    // view, not her older message (walkthrough 09-buddy-prepared, 05-buddy-planned-360).
    expect(followsEnd(true, 0, 400, 500, 900)).toBe(true);
    // A new reply made the thread longer: still following, though not at the end yet.
    expect(followsEnd(true, 400, 400, 500, 1400)).toBe(true);
    // Scrolling towards the new end keeps following.
    expect(followsEnd(true, 400, 700, 500, 1400)).toBe(true);
  });

  it('leaves her where she is when she scrolled up to read', () => {
    expect(followsEnd(true, 400, 150, 500, 900)).toBe(false);
    // A new message arrives meanwhile: she is not yanked down.
    expect(followsEnd(false, 150, 150, 500, 1400)).toBe(false);
    // Scrolling down, but not yet at the end: still not following.
    expect(followsEnd(false, 150, 600, 500, 1400)).toBe(false);
  });

  it('keeps following when the content shrank under it (not her scrolling up)', () => {
    // The view grew or the content shrank: the browser pulls the offset back
    // (walkthrough 09-buddy-prepared).
    expect(followsEnd(true, 400, 250, 500, 800, 24, true)).toBe(true);
    // Without a change of size the same jump is her scrolling up.
    expect(followsEnd(true, 400, 250, 500, 800)).toBe(false);
    // Not following stays not following.
    expect(followsEnd(false, 400, 250, 500, 800, 24, true)).toBe(false);
  });

  it('follows again once she is back at the end', () => {
    expect(followsEnd(false, 600, 890, 500, 1400)).toBe(true);
    expect(followsEnd(false, 0, 0, 500, 300)).toBe(true);
  });
});
