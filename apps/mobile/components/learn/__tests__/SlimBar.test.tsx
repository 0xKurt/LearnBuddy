// The bar on top of Buddy's home, and the one thing it must never do: hide the name of the
// sheet it is about (issue #204).
//
// The owner, on the promo footage: „Kartentitel kürzer formulieren oder zweizeilig erlauben
// statt «…»" — he had "Vokabelliste E…" and "Weiterüben Englisch-Vokabeltest – …" on screen,
// and on a 360 pt phone the walkthrough's own shot said "Arbeitsbla…" / "Schick mir ei…".
// A name cut off is a bar that cannot say what it is about.
//
// What this layer sees: how many lines a text may take, and what is one tap away instead of
// crowding the line. How many lines it actually takes on a 360 pt phone is geometry, and
// that is tests/web/fit.ts — jsdom lays nothing out (docs/testing-layers.md).

import type { NowCard } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp, styleOf } from '../../../testing/render.js';
import { CaptureBar, ReadyBar, ResumeBar } from '../SlimBar.js';

/** The kind of name that did not fit: a sheet called by what it really is. */
const LONG = 'Vokabelliste Englisch Unit 3 – unregelmäßige Verben';

const ready: Extract<NowCard, { type: 'practice_ready' }> = {
  type: 'practice_ready',
  step_id: '11111111-1111-4111-8111-111111111111',
  title: LONG,
  question_count: 12,
  est_minutes: 10,
  focus_topics: [],
  goal: null,
};

const capture: Extract<NowCard, { type: 'capture_needed' }> = {
  type: 'capture_needed',
  step_id: '22222222-2222-4222-8222-222222222222',
  title: 'Arbeitsblatt Brüche',
  goal: null,
  completes: null,
};

const resume: Extract<NowCard, { type: 'resume_practice' }> = {
  type: 'resume_practice',
  session_id: '33333333-3333-4333-8333-333333333333',
  mode: 'practice',
  title: LONG,
  remaining: 2,
};

/** How many lines this text may take before the browser cuts it with "…". */
function lines(el: Element): string {
  return styleOf(el).getPropertyValue('-webkit-line-clamp');
}

describe('the name on the bar (issue #204)', () => {
  it('may take a second line instead of ending in "…"', () => {
    renderInApp(
      <ReadyBar
        card={ready}
        busy={false}
        titleInset={40}
        onStart={() => undefined}
        onSkip={() => undefined}
      />,
    );
    // The whole name is in the document — nothing shortened it on the way in …
    const title = screen.getByText(LONG);
    // … and it is allowed the second line it needs.
    expect(lines(title), 'the sheet’s name may take two lines').toBe('2');
  });

  it('gives the same second line to the name in a resume bar, where it lives in the line', () => {
    renderInApp(
      <ResumeBar card={resume} busy={false} titleInset={40} onResume={() => undefined} />,
    );
    // "Weiterüben" leads, and the sheet's name stands in the line under it (#204: that is
    // the one that read "Weiterüben Englisch-Vokabeltest – …").
    const line = screen.getByText(`${LONG} – noch 2 Aufgaben`);
    expect(lines(line)).toBe('2');
  });
});

describe('the capture bar says little and keeps the rest one tap away (issue #204)', () => {
  it('asks in a short line beside the name, not in a sentence that gets cut', () => {
    renderInApp(
      <CaptureBar card={capture} busy={false} titleInset={40} onPress={() => undefined} />,
    );
    expect(screen.getByText('Arbeitsblatt Brüche')).toBeTruthy();
    expect(screen.getByText('Schick mir ein Foto.')).toBeTruthy();
    // What Buddy will do with it is not gone — it is behind the tap, and a screen reader
    // hears all of it in the bar's own label.
    expect(screen.queryByText('Daraus mache ich dir Übungen.')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Arbeitsblatt Brüche. Schick mir ein Foto. Daraus mache ich dir Übungen.',
      }),
    ).toBeTruthy();
  });

  it('shows the why, and the way out, when she opens it', () => {
    renderInApp(
      <CaptureBar
        card={capture}
        busy={false}
        titleInset={40}
        onPress={() => undefined}
        onNoPhoto={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Arbeitsblatt Brüche\./ }));
    expect(screen.getByText('Daraus mache ich dir Übungen.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kein Foto nötig' })).toBeTruthy();
  });
});
