import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { followsEnd, homeLayout, topKey } from '../homeLayout.js';

type Parts = Pick<BuddyHome, 'now' | 'decision' | 'working'>;

const capture: NonNullable<BuddyHome['now']> = {
  type: 'capture_needed',
  step_id: '00000000-0000-4000-8000-000000000001',
  title: 'Arbeitsblatt Brüche',
  goal: null,
};
const reading: NonNullable<BuddyHome['now']> = {
  type: 'material_processing',
  material_id: '00000000-0000-4000-8000-000000000002',
  status: 'processing',
};
const optIn: NonNullable<BuddyHome['decision']> = {
  type: 'contact_opt_in',
  can_enable_here: false,
  rules: { quiet_start: '20:00' },
};

describe('home layout (user feedback #6)', () => {
  it('has at most one card on top: the photo request, and the opt-in asked in the chat', () => {
    // Lena's crowded home (p2-04): "Schick mir ein Foto" and "Darf ich dir aufs Handy
    // schreiben?" both on top, each with a violet button.
    const l = homeLayout({ now: capture, decision: optIn, working: null } satisfies Parts);
    expect(l).toEqual({ top: 'now', decisionInline: true, working: null });
  });

  it('shows the decision as the card when nothing else is on top', () => {
    expect(homeLayout({ now: null, decision: optIn, working: null })).toEqual({
      top: 'decision',
      decisionInline: false,
      working: null,
    });
    expect(homeLayout({ now: null, decision: null, working: null }).top).toBeNull();
  });

  it('says "working" once: inside "Ich lese dein Blatt", else at the end of the chat', () => {
    // p2-08: "Ich lese dein Blatt …" and "Ich mache aus deinem Blatt gerade Übungen …" stacked.
    expect(homeLayout({ now: reading, decision: null, working: 'material' }).working).toBe('card');
    expect(homeLayout({ now: capture, decision: null, working: 'material' }).working).toBe(
      'thread',
    );
    expect(homeLayout({ now: null, decision: null, working: 'session' })).toMatchObject({
      top: null,
      working: 'thread',
    });
  });
});

describe('the card on top, closed on this phone (it lies over the menu)', () => {
  const ready: NonNullable<BuddyHome['now']> = {
    type: 'practice_ready',
    step_id: '00000000-0000-4000-8000-000000000003',
    title: 'Mathearbeit Brüche',
    question_count: 4,
    est_minutes: 5,
    focus_topics: [],
    goal: null,
  };
  const ok = { model: true, scheduler: 'ok' } as const;

  it('stays closed while the card says the same, and comes back when it says something new', () => {
    const closed = topKey({ now: ready, decision: null, system: ok });
    expect(closed).not.toBeNull();
    expect(homeLayout({ now: ready, decision: null, working: null }, closed).top).toBeNull();
    // Another practice is ready: shown again.
    const other = { ...ready, step_id: '00000000-0000-4000-8000-000000000004' };
    expect(homeLayout({ now: other, decision: null, working: null }, closed).top).toBe('now');
    // The same practice, now with fewer questions: something new, shown again.
    expect(
      homeLayout({ now: { ...ready, question_count: 3 }, decision: null, working: null }, closed)
        .top,
    ).toBe('now');
  });

  it('asks a closed decision at the end of the conversation instead', () => {
    const closed = topKey({ now: null, decision: optIn });
    expect(homeLayout({ now: null, decision: optIn, working: null }, closed)).toEqual({
      top: null,
      decisionInline: true,
      working: null,
    });
  });

  it('says "working" in the conversation when "Ich lese dein Blatt" is closed', () => {
    const closed = topKey({ now: reading, decision: null });
    expect(homeLayout({ now: reading, decision: null, working: 'material' }, closed).working).toBe(
      'thread',
    );
  });

  it('has a key for the system notes alone, and none when nothing is on top', () => {
    expect(topKey({ now: null, decision: null, system: ok })).toBeNull();
    expect(
      topKey({ now: null, decision: null, system: { model: false, scheduler: 'ok' } }),
    ).not.toBeNull();
    // A note that comes up changes what is on top: shown again.
    expect(
      topKey({ now: ready, decision: null, system: { model: true, scheduler: 'stale' } }),
    ).not.toBe(topKey({ now: ready, decision: null, system: ok }));
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
    // The card on top got shorter: less room kept free above the thread, the browser pulls
    // the offset back (walkthrough 09-buddy-prepared).
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
