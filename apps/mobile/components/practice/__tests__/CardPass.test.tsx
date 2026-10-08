// Lernkarten (Issue #147, Stufe 2): was auf dem Kartenbildschirm steht — und was gerade NICHT
// darauf stehen darf.
//
// Die Karte wird nicht geprüft; sie sagt selbst, ob sie es wusste. Daraus folgt alles, was
// diese Schicht festhält:
//
//   · die Lösung ist erst nach dem Umdrehen zu sehen (vorher wäre der Durchgang sinnlos),
//   · „Wusste ich" und „Noch nicht" haben dasselbe Gewicht — gleiche Variante, gleiche Größe,
//     nebeneinander. Wäre die freundliche Antwort der Primärknopf, würde der Bildschirm sie
//     zum Behaupten schubsen, und genau gegen diese Schlagseite muss die Bewertung auf dem
//     Server ohnehin schon anrechnen (`apps/api/src/modules/practice/fsrs.ts` RATING),
//   · es gibt kein Antwortfeld, kein „Tipp", kein „Lösung zeigen" — hier ist nichts zu
//     bewerten und nichts zu verraten; das Feld der einen Leiste ist ihre Frage an den Tutor
//     (#384), die Aktion der Karte steht, wo „Prüfen" steht, und beendet wird mit dem runden ✕,
//     wie jede Übung,
//   · am Ende steht keine Zahl: wie viele sie wusste, ist ihre eigene Schätzung (Regel 5),
//     und was noch aussteht, ist keine Zahl für sie (Regel 6).
//
// Was diese Schicht nicht sehen kann: ob der Server die Selbsteinschätzung schwächer wertet
// als eine geprüfte Antwort. Das halten `apps/api/src/modules/practice/__tests__/cards.test.ts`
// (in Tagen gerechnet) und `apps/api/src/__tests__/flashcards.int.test.ts` (auf echtem
// Postgres). Geometrie sieht sie auch nicht — jsdom legt nichts aus (docs/testing-layers.md).

import { screen } from '@testing-library/react';
import type {
  PracticeTurnView,
  SessionItemView,
  SessionView,
} from '@learnbuddy/shared-types/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDrafts } from '../../../lib/drafts.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { CardPass } from '../CardPass.js';

const card = (over: Partial<SessionItemView['item']> = {}): SessionItemView => ({
  item: {
    id: over.id ?? '11111111-1111-4111-8111-111111111111',
    kind: 'vocab',
    prompt: 'le vélo',
    choices: null,
    unit: null,
    topic: 'Unité 3',
    origin: 'typed',
    lang: 'de',
    prompt_lang: 'fr',
    subject_kind: null,
    figure: null,
    choice_figures: null,
    image: null,
    tap_choices: null,
    surface: null,
    tap: false,
    task_view: null,
    listen: null,
    passage: null,
    task_part: null,
    read_aloud: false,
    ...over,
  },
  status: 'open',
  attempts: 0,
  hints_used: 0,
  hints_left: 0,
  hint_available: false,
  hint_offered: false,
  reveal_available: false,
  deferred: false,
  // The back of the card: a pass sends it while the card is still open.
  answer: 'das Fahrrad',
  listen_transcript: null,
  explanation: null,
  why: null,
});

const pass = (over: Partial<SessionView> = {}): SessionView => ({
  id: '22222222-2222-4222-8222-222222222222',
  mode: 'practice',
  reveal_allowed: true,
  status: 'active',
  title: 'Unité 3',
  card_pass: true,
  card_pass_offered: false,
  drill: null,
  // A card pass is never written in two parts (issue #220): it is made from questions she
  // already has.
  preparing: false,
  timer: null,
  items: [card()],
  turns: [],
  current_item_id: '11111111-1111-4111-8111-111111111111',
  summary: null,
  ...over,
});

/** One turn of her question about the first card, or the tutor's reply. */
const turn = (
  id: string,
  role: PracticeTurnView['role'],
  text: string,
  verdict: PracticeTurnView['verdict'],
): PracticeTurnView => ({
  id,
  item_id: '11111111-1111-4111-8111-111111111111',
  role,
  text,
  verdict,
  pronunciation: null,
  reexplain: null,
  created_at: '2026-10-05T09:00:00Z',
});

function show(session: SessionView = pass(), pending: string | null = null) {
  const onChange = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const onKeep = vi.fn(async () => undefined);
  renderInApp(
    <CardPass
      session={session}
      title="Unité 3"
      onChange={onChange}
      onClose={onClose}
      asked={{ pending, onKeep }}
    />,
  );
  return { onChange, onClose };
}

describe('die Karte', () => {
  // A turned card is kept like a draft (it survives a remount): every test starts face up.
  beforeEach(() => clearDrafts());
  it('zeigt das Wort und erst nach dem Umdrehen die Lösung', async () => {
    show();
    expect(screen.getByText('le vélo')).toBeTruthy();
    expect(screen.queryByText('das Fahrrad')).toBeNull();
    screen.getByRole('button', { name: 'Umdrehen' }).click();
    expect(await screen.findByText('das Fahrrad')).toBeTruthy();
  });

  it('fragt nach dem Umdrehen, ob sie es wusste — und sonst nichts', async () => {
    show();
    screen.getByRole('button', { name: 'Umdrehen' }).click();
    expect(await screen.findByRole('button', { name: 'Wusste ich' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Noch nicht' })).toBeTruthy();
    // Kein zweiter Weg: nichts zu tippen, nichts zu prüfen, kein Tipp, keine Lösung zeigen.
    for (const gone of ['Prüfen', 'Tipp', 'Lösung zeigen', 'Überspringen', 'Weiter']) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull();
    }
    expect(screen.queryByLabelText('Deine Antwort')).toBeNull();
    // Umgedreht ist umgedreht: das Umdrehen ist kein Knopf mehr, den sie suchen muss.
    expect(screen.queryByRole('button', { name: 'Umdrehen' })).toBeNull();
  });

  it('bleibt umgedreht, wenn der Bildschirm neu aufgebaut wird (Farbwechsel, #384)', async () => {
    // Der Wechsel hell ↔ dunkel baut den ganzen Baum neu auf (lib/theme/ThemeProvider.tsx); im
    // Walkthrough stand die Karte danach wieder auf der Vorderseite, ihre Lösung war weg.
    const first = renderInApp(
      <CardPass
        session={pass()}
        title="Unité 3"
        onChange={vi.fn(async () => undefined)}
        onClose={vi.fn()}
        asked={{ pending: null, onKeep: vi.fn(async () => undefined) }}
      />,
    );
    screen.getByRole('button', { name: 'Umdrehen' }).click();
    await screen.findByText('das Fahrrad');
    first.unmount();
    show();
    expect(await screen.findByText('das Fahrrad')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Umdrehen' })).toBeNull();
  });

  it('macht keine der beiden Antworten zur leichteren', async () => {
    show();
    screen.getByRole('button', { name: 'Umdrehen' }).click();
    const knew = await screen.findByRole('button', { name: 'Wusste ich' });
    const not = screen.getByRole('button', { name: 'Noch nicht' });
    const box = (el: HTMLElement) => styleOf(el.firstElementChild as Element);
    // Gleiche Fläche, gleiche Farbe, gleiche Höhe: der Bildschirm nimmt ihr die Antwort nicht
    // vorweg. (Ein Primärknopf wäre violett gefüllt, der andere nicht.)
    expect(box(knew).backgroundColor).toBe(box(not).backgroundColor);
    expect(box(knew).minHeight).toBe(box(not).minHeight);
    expect(box(knew).color).toBe(box(not).color);
  });

  it('endet mit dem runden ✕ wie jede Übung, nicht mit einem Wort-Knopf (#384)', () => {
    const { onClose } = show();
    const end = screen.getByRole('button', { name: 'Lernkarten beenden' });
    expect(screen.queryByText('Beenden')).toBeNull();
    end.click();
    expect(onClose).toHaveBeenCalled();
  });

  it('hat die eine Leiste: ihre Frage im Feld, die Aktion der Karte daneben (#384)', async () => {
    show();
    // Vor dem Umdrehen und danach: dasselbe Feld, „Frag zur Aufgabe …", wie bei jeder Frage.
    expect(screen.getByTestId('ask-field')).toBeTruthy();
    screen.getByRole('button', { name: 'Umdrehen' }).click();
    await screen.findByRole('button', { name: 'Wusste ich' });
    expect(screen.getByTestId('ask-field')).toBeTruthy();
  });

  it('zeigt ihre Frage und die Antwort des Tutors unter der Karte (#384)', () => {
    show(
      pass({
        turns: [
          turn('44444444-4444-4444-8444-444444444444', 'learner', 'Ist vélo männlich?', null),
          turn('55555555-5555-4555-8555-555555555555', 'tutor', 'Ja: le vélo.', 'not_an_attempt'),
        ],
      }),
    );
    expect(screen.getByText('Ist vélo männlich?')).toBeTruthy();
    expect(screen.getByText('Ja: le vélo.')).toBeTruthy();
  });

  it('sagt, wo sie ist — in Karten, nicht in Fragen', () => {
    show(
      pass({
        items: [card(), card({ id: '33333333-3333-4333-8333-333333333333', prompt: 'la gare' })],
      }),
    );
    expect(screen.getByText('Karte 1 von 2')).toBeTruthy();
    expect(screen.queryByText('Frage 1 von 2')).toBeNull();
  });

  it('endet ohne Zahl und mit einem Weg zurück', () => {
    const { onClose } = show(
      pass({
        status: 'finished',
        items: [{ ...card(), status: 'revealed' }],
        current_item_id: null,
        summary: { answered: 1, first_try: 0, secure_topics: [], shaky_topics: [] },
      }),
    );
    expect(screen.getByText('Durch!')).toBeTruthy();
    // Keine „1 von 1", kein „so viele hast du beantwortet": beides wäre ihre eigene
    // Schätzung als Ergebnis ausgegeben. (Der Blattname „Unité 3" bleibt, der zählt nichts.)
    expect(screen.queryByText(/\d+\s+von\s+\d+/)).toBeNull();
    expect(screen.queryByText(/beantwortet|richtig|gewusst/i)).toBeNull();
    // Und auch keine Themenaussage: „Heute ohne Tipp geschafft: …" wäre genau die
    // Behauptung, die niemand geprüft hat.
    expect(screen.queryByText(/Heute ohne Tipp|Schauen wir nochmal an/)).toBeNull();
    const back = screen.getByRole('button', { name: 'Zurück zu Buddy' });
    back.click();
    expect(onClose).toHaveBeenCalled();
  });
});
