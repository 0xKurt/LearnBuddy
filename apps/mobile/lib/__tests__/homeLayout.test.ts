import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { followsEnd, homeLayout } from '../homeLayout.js';

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

  it('follows again once she is back at the end', () => {
    expect(followsEnd(false, 600, 890, 500, 1400)).toBe(true);
    expect(followsEnd(false, 0, 0, 500, 300)).toBe(true);
  });
});
