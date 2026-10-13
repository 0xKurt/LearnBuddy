// What a run says about itself, and where (#599): a test's clock in the head's subtitle and its
// rule in the question card's meta line (design ui_kits/app/Tasks.jsx `test`), homework's hint as
// a quiet line above the card (ui_kits/app/Flows.jsx:50) — nothing in a violet strip under the
// head. And the result page's second way on: a ghost without a sign, 20 from the sides
// (ui_kits/app/Done.jsx:23, :43), read from the source like `oneListen.test.ts`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { i18n } from '../../../lib/i18n/index.js';
import { renderInApp } from '../../../testing/render.js';
import { QuestionCard, RunMeta } from '../Question.js';
import { HomeworkHint, progressLine, QuestionProgress, testMeta } from '../QuestionProgress.js';
import { TestClockHeader, useTestClock } from '../TestClock.js';

const seen = vi.hoisted(() => ({ window: 844, overlap: 0, visible: 844 }));
vi.mock('../../../lib/useVisibleHeight.js', () => ({ useVisibleHeight: () => seen }));

const t = i18n.t.bind(i18n);
const PROGRESS = { position: 1, total: 3, closed: 0, preparing: false };

afterEach(() => {
  Object.assign(seen, { window: 844, overlap: 0, visible: 844 });
  vi.useRealTimers();
});

describe('a test with time', () => {
  it('puts the minutes left into the head’s second line, beside where she is', () => {
    expect(progressLine(t, PROGRESS, null)).toBe('Frage 1 von 3');
    expect(progressLine(t, PROGRESS, 10)).toBe('Frage 1 von 3 · noch 10 Min.');
    expect(progressLine(t, { ...PROGRESS, preparing: true }, null)).toBe(
      'Frage 1 · ich schreibe noch mehr',
    );
  });

  it('says its rule in the card’s meta line, and the gentle sentence from five minutes on', () => {
    expect(testMeta(t, false, false)).toBeNull();
    expect(testMeta(t, true, false)).toBe('Probetest · eine Antwort, keine Tipps');
    expect(testMeta(t, true, true)).toBe('Schau in Ruhe, was du noch schaffst.');
  });

  it('the card shows that line in place of topic and origin', () => {
    renderInApp(
      <RunMeta.Provider value="Probetest · eine Antwort, keine Tipps">
        <QuestionCard prompt="Welches Gas?" topic="Photosynthese" fromBuddy />
      </RunMeta.Provider>,
    );
    expect(screen.getByTestId('question-meta').textContent).toBe(
      'Probetest · eine Antwort, keine Tipps',
    );
  });

  it('ticks under the head and reports whole minutes; no pill and no line of its own', () => {
    vi.useFakeTimers();
    const timeUp = vi.fn();
    const view = renderInApp(
      <TestClockHeader
        timer={{ minutes: 10, remaining_ms: 10 * 60_000, ran_out: false }}
        receivedAt={Date.now()}
        onTimeUp={timeUp}
        progress={{ ...PROGRESS, hideLabel: true }}
      />,
    );
    expect(useTestClock.getState()).toEqual({ minutes: 10, soon: false });
    expect(screen.queryByText(/Min\./)).toBeNull();
    expect(screen.queryByTestId('test-clock')).toBeNull();
    expect(screen.getByTestId('progress-bar')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(5 * 60_000 + 2_000);
    });
    expect(useTestClock.getState()).toEqual({ minutes: 5, soon: true });
    expect(timeUp).not.toHaveBeenCalled();
    view.unmount();
    // Gone with its test: no stale minutes in the next run's head.
    expect(useTestClock.getState()).toEqual({ minutes: null, soon: false });
  });
});

describe('the strip under the head is gone', () => {
  const session = { mode: 'help', timer: null } as never;
  const props = {
    session,
    item: {} as never,
    open: true,
    flaggable: false,
    progress: PROGRESS,
    disabled: false,
    onCorner: () => undefined,
    receivedAt: 0,
    onTimeUp: () => undefined,
  };

  it('homework and a test show only the progress there', () => {
    const view = renderInApp(<QuestionProgress {...props} inHeader testing={false} />);
    expect(screen.queryByText(/Hausaufgabe/)).toBeNull();
    view.rerender(<QuestionProgress {...props} inHeader testing />);
    expect(screen.queryByText(/Probetest/)).toBeNull();
    expect(screen.getByTestId('progress-bar')).toBeDefined();
  });

  it('homework’s hint is a quiet line in the page, and steps aside while she types', () => {
    const view = renderInApp(<HomeworkHint />);
    const hint = screen.getByTestId('homework-hint');
    expect(hint.textContent).toBe(
      'Hausaufgabe – ich gebe dir Tipps, die Lösung findest du selbst.',
    );
    expect([hint.style.fontSize, hint.style.lineHeight, hint.style.fontWeight]).toEqual([
      '14px',
      '20px',
      '400',
    ]);
    Object.assign(seen, { window: 440, visible: 440 });
    view.rerender(<HomeworkHint />);
    expect(screen.queryByTestId('homework-hint')).toBeNull();
  });
});

describe('the result page’s shape (Done.jsx)', () => {
  const source = (name: string) => readFileSync(join(__dirname, '..', name), 'utf8');

  it('stands 20 from the sides and 28 under the head', () => {
    expect(source('RunResult.tsx')).toMatch(/paddingHorizontal: GUTTER_OUTER/);
    expect(source('RunResult.tsx')).toMatch(/paddingTop: RESULT\.top/);
    expect(source('PassEnd.tsx')).toMatch(/paddingHorizontal: GUTTER_OUTER/);
  });

  it('offers its second way on as a ghost without a sign, of the plain size', () => {
    for (const name of ['RunResult.tsx', 'AgainButton.tsx', 'DrillRound.tsx']) {
      const ghosts = source(name).match(/<Btn\b[^>]*variant="ghost"[^>]*>/gs) ?? [];
      expect(ghosts.length, name).toBeGreaterThan(0);
      for (const ghost of ghosts) {
        expect(ghost, name).not.toMatch(/\bicon=/);
        expect(ghost, name).not.toMatch(/size="lg"/);
      }
    }
    expect(source('AgainButton.tsx')).not.toMatch(/variant=\{|'soft'/);
  });
});
