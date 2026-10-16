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

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';

const rgb = (hex: string): string =>
  `rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

const answerDrill = vi.fn();
vi.mock('../../../lib/api/learningEndpoints.js', async (orig) => ({
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
    tones: null,
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
  it('zeigt eine Aufgabe und ein numerisches Textfeld und „Prüfen“ — sonst nichts', () => {
    show();
    expect(screen.getByText('7 · 8')).toBeTruthy();
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Löschen']) {
      expect(screen.queryByRole('button', { name: d })).toBeNull();
    }
    expect(screen.getAllByRole('textbox', { name: 'Deine Antwort' })).toHaveLength(1);
    // Die Ziffern kommen vom Zahlenfeld des Handys (Owner-Regel 8), nie von eigenen Tasten.
    expect(screen.getByRole('textbox', { name: 'Deine Antwort' }).getAttribute('inputmode')).toBe(
      'numeric',
    );
    // „Prüfen" ist die Pille des einen Composers, mit ihrem Zeichen, im Primär-Slot.
    const check = screen.getByRole('button', { name: 'Prüfen' });
    expect(screen.getByTestId('composer-primary').contains(check)).toBe(true);
    expect(check.querySelector('svg')).not.toBeNull();
    // Ganze Zahlen: kein Bruchstrich auf dem Block.
    expect(screen.queryByRole('button', { name: 'Bruchstrich' })).toBeNull();
    for (const gone of ['Tipp', 'Lösung zeigen', 'Überspringen', 'Weiter']) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull();
    }
    expect(screen.getByText('Aufgabe 1 von 2')).toBeTruthy();
  });

  // Design ui_kits/app/Flows.jsx:82–87 (#599): die Fragekarte jeder Aufgabe.
  it('zeigt eine Metazeile und Aufgabe, „=“ und Feld in einer Zeile; das Feld füllt sich mit', () => {
    show();
    expect(screen.getByText('Kopfrechnen · so schnell du kannst')).toBeTruthy();
    const row = screen.getByTestId('drill-task');
    expect(styleOf(row).flexDirection).toBe('row');
    expect(row.textContent).toBe('7 · 8 =?');
    // Die Überschrift ist die Aufgabe allein; das Gleichheitszeichen ist Zeichnung.
    expect(screen.getByRole('heading', { name: '7 · 8' })).toBeTruthy();
    // 800 52/1 mit −1 Laufweite, Aufgabe wie Feld.
    const task = screen.getByText('7 · 8').style;
    expect([task.fontSize, task.lineHeight, task.letterSpacing, task.fontWeight]).toEqual([
      '52px',
      '52px',
      '-1px',
      '800',
    ]);
    const slot = screen.getByTestId('drill-slot');
    const p = paletteOf('pastell');
    expect(styleOf(slot).borderTopStyle).toBe('dashed');
    expect(styleOf(slot).backgroundColor).toBe(rgb(p.canvas));
    expect(slot.textContent).toBe('?');
    fireEvent.change(screen.getByRole('textbox', { name: 'Deine Antwort' }), {
      target: { value: '56' },
    });
    expect(slot.textContent).toBe('56');
    expect(styleOf(slot).borderTopStyle).toBe('solid');
    expect(styleOf(slot).borderTopWidth).toBe('2px');
    expect(styleOf(slot).backgroundColor).toBe(rgb(p.primaryLt));
  });

  it('„Prüfen“ wartet, bis etwas getippt ist; Löschen nimmt die letzte Ziffer', () => {
    show();
    const check = key('Prüfen');
    expect(check.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Deine Antwort' }), {
      target: { value: '54' },
    });
    expect(
      (screen.getByRole('textbox', { name: 'Deine Antwort' }) as HTMLTextAreaElement).value,
    ).toBe('54');
    fireEvent.change(screen.getByRole('textbox', { name: 'Deine Antwort' }), {
      target: { value: '5' },
    });
    expect(
      (screen.getByRole('textbox', { name: 'Deine Antwort' }) as HTMLTextAreaElement).value,
    ).toBe('5');
    expect(key('Prüfen').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('die nächste Aufgabe kommt sofort; das Urteil des Servers steht danach darunter', async () => {
    let resolve: (v: SessionView) => void = () => undefined;
    answerDrill.mockReturnValue(new Promise<SessionView>((r) => (resolve = r)));
    const { onChange } = show();
    fireEvent.change(screen.getByRole('textbox', { name: 'Deine Antwort' }), {
      target: { value: '54' },
    });
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

  // Die Runde aus `modes.spec.ts`, bei der „Prüfen" aus blieb (#599): die Antwort des Servers ist
  // da, die Sitzung aber noch nicht gespeichert (`store` wartet erst auf `cancelQueries`). In
  // dieser Lücke stand die schon beantwortete Aufgabe wieder auf der Karte, und was sie tippte,
  // ging in deren Entwurf und war mit der nächsten Aufgabe weg.
  it('zeigt die beantwortete Aufgabe nie wieder, während die Antwort des Servers gespeichert wird', async () => {
    let answered: (v: SessionView) => void = () => undefined;
    answerDrill.mockReturnValue(new Promise<SessionView>((r) => (answered = r)));
    let stored: () => void = () => undefined;
    const onChange = vi.fn(() => new Promise<void>((r) => (stored = r)));
    const next = round({
      items: [task(A, '7 · 8', { status: 'correct' }), task(B, '6 · 7')],
    });
    const shown = (session: SessionView) => (
      <DrillRound session={session} title="Einmaleins" onChange={onChange} onClose={vi.fn()} />
    );
    const view = renderInApp(shown(round()));
    const input = () =>
      screen.getByRole('textbox', { name: 'Deine Antwort' }) as HTMLTextAreaElement;
    fireEvent.change(input(), { target: { value: '56' } });
    fireEvent.click(key('Prüfen'));
    expect(await screen.findByText('6 · 7')).toBeTruthy();
    // Sie tippt schon die nächste Antwort.
    fireEvent.change(input(), { target: { value: '42' } });
    await act(async () => {
      answered(next);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledOnce();
    // Der Server hat geantwortet, gespeichert ist noch nichts: die Karte bleibt bei Aufgabe 2.
    expect(screen.queryByText('7 · 8')).toBeNull();
    expect(screen.getByText('6 · 7')).toBeTruthy();
    expect(input().value).toBe('42');
    expect(key('Prüfen').getAttribute('aria-disabled')).not.toBe('true');
    await act(async () => {
      // Gespeichert: die Sitzung, wie der Server sie hält, steht jetzt auf dem Bildschirm.
      view.rerender(shown(next));
      stored();
      await Promise.resolve();
    });
    expect(input().value).toBe('42');
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
    expect(screen.getByTestId('drill-last').textContent).toContain('Das war: 7 · 8 = 56');
    expect(screen.queryByText(/falsch/i)).toBeNull();
  });

  it('Brüche bekommen den Bruchstrich, einmal und nie zuerst', () => {
    show(round({ drill: { ...round().drill!, input: 'fraction' } }));
    const input = screen.getByRole('textbox', { name: 'Deine Antwort' }) as HTMLTextAreaElement;
    expect(key('Bruchstrich').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(key('Bruchstrich'));
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.click(key('Bruchstrich'));
    expect(input.value).toBe('3/');
    expect(key('Bruchstrich').getAttribute('aria-disabled')).toBe('true');
    expect(key('Prüfen').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(key('Bruchstrich'));
    expect(input.value).toBe('3/');
    fireEvent.change(input, { target: { value: '3/4' } });
    expect(input.value).toBe('3/4');
    expect(key('Prüfen').getAttribute('aria-disabled')).not.toBe('true');
    answerDrill.mockReturnValue(new Promise<SessionView>(() => undefined));
    fireEvent.click(key('Prüfen'));
    expect(answerDrill).toHaveBeenCalledWith(round().id, A, '3/4');
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
    expect(screen.getByTestId('drill-line').textContent).toBe('Die 7er sitzen jetzt besser.');
    expect(screen.queryByText(/\d+\s+(von|falsch|Fehler)/)).toBeNull();
    expect(key('Noch eine Runde')).toBeTruthy();
    expect(key('Zurück zu Buddy')).toBeTruthy();
  });
  it('keeps an abandoned round factual with no finished lead or another-round offer', () => {
    const { onClose } = show(round({ status: 'abandoned' }));
    expect(screen.getByRole('heading', { name: 'Diese Übung ist schon beendet.' })).toBeTruthy();
    expect(screen.queryByTestId('drill-line')).toBeNull();
    expect(screen.queryByText('Geschafft!')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Noch eine Runde' })).toBeNull();
    key('Zurück zu Buddy').click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
