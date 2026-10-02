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
//     bewerten und nichts zu verraten,
//   · am Ende steht keine Zahl: wie viele sie wusste, ist ihre eigene Schätzung (Regel 5),
//     und was noch aussteht, ist keine Zahl für sie (Regel 6).
//
// Was diese Schicht nicht sehen kann: ob der Server die Selbsteinschätzung schwächer wertet
// als eine geprüfte Antwort. Das halten `apps/api/src/modules/practice/__tests__/cards.test.ts`
// (in Tagen gerechnet) und `apps/api/src/__tests__/flashcards.int.test.ts` (auf echtem
// Postgres). Geometrie sieht sie auch nicht — jsdom legt nichts aus (docs/testing-layers.md).

import { screen } from '@testing-library/react';
import type { SessionItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it, vi } from 'vitest';

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
    figure: null,
    image: null,
    tap_choices: null,
    surface: null,
    board: null,
    listen: null,
    ...over,
  },
  status: 'open',
  attempts: 0,
  hints_used: 0,
  hints_left: 0,
  hint_available: false,
  reveal_available: false,
  deferred: false,
  // The back of the card: a pass sends it while the card is still open.
  answer: 'das Fahrrad',
  listen_transcript: null,
});

const pass = (over: Partial<SessionView> = {}): SessionView => ({
  id: '22222222-2222-4222-8222-222222222222',
  mode: 'practice',
  reveal_allowed: true,
  status: 'active',
  title: 'Unité 3',
  card_pass: true,
  card_pass_offered: false,
  // A card pass is never written in two parts (issue #220): it is made from questions she
  // already has.
  preparing: false,
  items: [card()],
  turns: [],
  current_item_id: '11111111-1111-4111-8111-111111111111',
  summary: null,
  ...over,
});

function show(session: SessionView = pass()) {
  const onChange = vi.fn(async () => undefined);
  const onClose = vi.fn();
  renderInApp(<CardPass session={session} title="Unité 3" onChange={onChange} onClose={onClose} />);
  return { onChange, onClose };
}

describe('die Karte', () => {
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
