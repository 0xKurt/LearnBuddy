import type { BuddyHome } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { followTarget, homeLayout } from '../homeLayout.js';

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
  rules: { max_per_day: 1, quiet_start: '20:00' },
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
  it('is at its end when everything fits or her message is still in view', () => {
    expect(followTarget(300, 500, 20)).toBe(0);
    expect(followTarget(900, 500, 450)).toBe(400);
    expect(followTarget(900, 500, null)).toBe(400);
  });

  it('never pushes her own last message out at the top', () => {
    // A long reply and two notices under her message: her message stays the first line.
    expect(followTarget(1400, 500, 600)).toBe(592);
  });
});
