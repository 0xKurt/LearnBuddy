// Kopfrechnen (Issue #243): was auf der Rundenkarte steht — eine Aufgabe, ein Ziffernblock,
// „Prüfen“ — und was NICHT: kein Tipp, keine Lösung zum Aufdecken, am Ende keine Zahl.
//
// Die nächste Aufgabe steht da, sobald sie „Prüfen“ drückt — die Antwort ist dann noch
// unterwegs. Was der Server dazu sagt, kommt in der Zeile unter der Karte an. Die Prüfung
// selbst hält `apps/api/src/__tests__/drill.int.test.ts` (echtes Postgres, kein Modell).
// requires live verification in Claude Code session (the API call is replaced)

import { act, fireEvent, screen } from '@testing-library/react';
import type { SessionItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';

const answerDrill = vi.fn();
vi.mock('../../../lib/api/endpoints.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  answerDrill: (...args: unknown[]) => answerDrill(...args) as Promise<SessionView>,
}));

const { DrillRound } = await import('../DrillRound.js');
const { clearDrafts } = await import('../../../lib/drafts.js');

const task = (
  id: string,
  prompt: string,
  over: Partial<SessionItemView> = {},
): SessionItemView => ({
  item: {
    id,
    kind: 'numeric',
    prompt,
    choices: null,
    unit: null,
    topic: 'Einmaleins mit 7',
    origin: 'buddy',
    lang: null,
    prompt_lang: null,
    figure: null,
    image: null,
    tap_choices: null,
    surface: null,
    tap: false,
    task_view: null,
    listen: null,
    passage: null,
    task_part: null,
    subject_kind: null,
    choice_figures: null,
    read_aloud: false,
  },
  status: 'open',
  attempts: 0,
  hints_used: 0,
  hints_left: 0,
  hint_available: false,
  hint_offered: false,
  reveal_available: false,
  deferred: false,
  answer: null,
  listen_transcript: null,
  explanation: null,
  why: null,
  ...over,
});

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const round = (over: Partial<SessionView> = {}): SessionView => ({
  id: '33333333-3333-4333-8333-333333333333',
  mode: 'practice',
  reveal_allowed: true,
  status: 'active',
  title: 'Einmaleins mit 6 und 7',
  card_pass: false,
  card_pass_offered: false,
  preparing: false,
  timer: null,
  items: [task(A, '7 · 8'), task(B, '6 · 7')],
  turns: [],
  current_item_id: A,
  summary: null,
  drill: {
    spec: { range: 'times', rows: [6, 7], carry: null },
    input: 'whole',
    last: null,
    summary: null,
  },
  ...over,
});

function show(session: SessionView = round()) {
  const onChange = vi.fn(async () => undefined);
  const onClose = vi.fn();
  renderInApp(
    <DrillRound session={session} title={session.title} onChange={onChange} onClose={onClose} />,
  );
  return { onChange, onClose };
}

const key = (name: string) => screen.getByRole('button', { name });

beforeEach(async () => {
  answerDrill.mockReset();
  // Her typed digits live in a draft that outlives a remount (lib/drafts.ts, #306) — and with it
  // a test: each test starts with an empty pad, whatever the one before typed.
  await clearDrafts();
});

describe('die Runde', () => {
  it('zeigt eine Aufgabe, einen Ziffernblock und „Prüfen“ — sonst nichts', () => {
    show();
    expect(screen.getByText('7 · 8')).toBeTruthy();
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Löschen']) {
      expect(key(d)).toBeTruthy();
    }
    // Ganze Zahlen: kein Bruchstrich auf dem Block.
    expect(screen.queryByRole('button', { name: 'Bruchstrich' })).toBeNull();
    for (const gone of ['Tipp', 'Lösung zeigen', 'Überspringen', 'Weiter']) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull();
    }
    expect(screen.getByText('Aufgabe 1 von 2')).toBeTruthy();
  });

  it('„Prüfen“ wartet, bis etwas getippt ist; Löschen nimmt die letzte Ziffer', () => {
    show();
    const check = key('Prüfen');
    expect(check.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(key('5'));
    fireEvent.click(key('4'));
    expect(screen.getByLabelText('Deine Antwort: 54')).toBeTruthy();
    fireEvent.click(key('Löschen'));
    expect(screen.getByLabelText('Deine Antwort: 5')).toBeTruthy();
    expect(key('Prüfen').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('die nächste Aufgabe kommt sofort; das Urteil des Servers steht danach darunter', async () => {
    let resolve: (v: SessionView) => void = () => undefined;
    answerDrill.mockReturnValue(new Promise<SessionView>((r) => (resolve = r)));
    const { onChange } = show();
    fireEvent.click(key('5'));
    fireEvent.click(key('4'));
    fireEvent.click(key('Prüfen'));
    // Ohne auf den Server zu warten: die nächste Aufgabe steht da.
    expect(await screen.findByText('6 · 7')).toBeTruthy();
    expect(answerDrill).toHaveBeenCalledWith(round().id, A, '54');
    const answered = round({
      items: [task(A, '7 · 8', { status: 'missed', answer: '56' }), task(B, '6 · 7')],
      drill: {
        ...round().drill!,
        last: { item_id: A, prompt: '7 · 8', answer: '56', given: '54', correct: false },
      },
    });
    await act(async () => {
      resolve(answered);
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledWith(answered);
  });

  it('zeigt nach einer falschen Antwort die richtige — ohne Wertung', () => {
    show(
      round({
        items: [task(A, '7 · 8', { status: 'missed', answer: '56' }), task(B, '6 · 7')],
        drill: {
          ...round().drill!,
          last: { item_id: A, prompt: '7 · 8', answer: '56', given: '54', correct: false },
        },
      }),
    );
    expect(screen.getByText('Das war:')).toBeTruthy();
    expect(screen.getByText('7 · 8 = 56')).toBeTruthy();
    expect(screen.queryByText(/falsch/i)).toBeNull();
  });

  it('Brüche bekommen den Bruchstrich, einmal und nie zuerst', () => {
    show(round({ drill: { ...round().drill!, input: 'fraction' } }));
    fireEvent.click(key('Bruchstrich'));
    expect(screen.getByLabelText('Deine Antwort: –')).toBeTruthy();
    fireEvent.click(key('3'));
    fireEvent.click(key('Bruchstrich'));
    fireEvent.click(key('Bruchstrich'));
    fireEvent.click(key('4'));
    expect(screen.getByLabelText('Deine Antwort: 3/4')).toBeTruthy();
  });

  it('endet mit einem Satz über eine Reihe — keine Zahl der Fehler — und „Noch eine Runde“', () => {
    show(
      round({
        status: 'finished',
        items: [
          task(A, '7 · 8', { status: 'missed', answer: '56' }),
          task(B, '6 · 7', { status: 'correct', answer: '42' }),
        ],
        current_item_id: null,
        summary: { answered: 2, first_try: 1, secure_topics: [], shaky_topics: [] },
        drill: {
          ...round().drill!,
          summary: { line: 'better', group: { kind: 'times', n: 7 } },
        },
      }),
    );
    expect(screen.getByText('Geschafft!')).toBeTruthy();
    expect(screen.getByText('Die 7er sitzen jetzt besser.')).toBeTruthy();
    expect(screen.queryByText(/\d+\s+(von|falsch|Fehler)/)).toBeNull();
    expect(key('Noch eine Runde')).toBeTruthy();
    expect(key('Zurück zu Buddy')).toBeTruthy();
  });
});
