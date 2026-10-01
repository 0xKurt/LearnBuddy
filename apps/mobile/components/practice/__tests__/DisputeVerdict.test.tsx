// „Die Bewertung stimmt nicht" (issue #164) — der Weg gegen ein Urteil, das schon gefällt ist.
//
// Was diese Schicht festhält, ist genau das, was dem Kind gegenübersteht:
//
//   · der Knopf ist AM Urteil erreichbar, nicht irgendwo in Einstellungen — und er ist erst
//     da, wenn es ein Urteil gibt (vorher gibt es „Frage passt nicht");
//   · im Probetest und bei Hausaufgaben gibt es ihn nicht: dort kommen die Ergebnisse am Ende
//     bzw. wird geholfen statt bewertet;
//   · die Lade ist kein Formular (Regel 16): ein Satz, ein Knopf, kein Freitextfeld, keine
//     Begründungspflicht, keine Zahl (Regel 6);
//   · und sie behauptet nicht, jemand habe die Bewertung geprüft und ihr recht gegeben
//     (Regel 5) — sie sagt, was wirklich passiert.
//
// Was diese Schicht nicht sehen kann: ob die Rücknahme auf dem Server wirklich greift. Das
// hält `session-lifecycle.int.test.ts` („a shown solution taken back leaves the earlier
// history standing"), auf einem echten Postgres.
//
// Und was sie hier nicht sehen kann, obwohl es da ist: `accessibilityHint` und
// `accessibilityState.busy` landen durch react-native-web gar nicht im DOM (gemessen, nicht
// vermutet — der Knopf trägt `aria-label`, `role` und bei `disabled`/`busy` ein
// `aria-disabled`, mehr nicht). Der Hinweis ist auf dem Telefon echt; hier wird deshalb
// geprüft, was ankommt: Name, Rolle und dass ein wartender Knopf keinen Tipp annimmt.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import {
  canDisputeVerdict,
  DisputeVerdictButton,
  DisputeVerdictSheet,
  type VerdictState,
} from '../DisputeVerdict.js';

/** Eine beantwortete Frage aus einer laufenden Übung — der Normalfall. */
const judged: VerdictState = {
  open: false,
  sessionStatus: 'active',
  testing: false,
  mode: 'practice',
  origin: 'material',
};

describe('ob es etwas zu bestreiten gibt', () => {
  it('bietet den Weg am gefällten Urteil an', () => {
    expect(canDisputeVerdict(judged)).toBe(true);
  });

  it('bietet ihn nicht an, solange die Frage offen ist — da gibt es noch kein Urteil', () => {
    expect(canDisputeVerdict({ ...judged, open: true })).toBe(false);
  });

  it('bietet ihn nicht im laufenden Probetest an: die Ergebnisse kommen am Ende', () => {
    expect(canDisputeVerdict({ ...judged, testing: true })).toBe(false);
    expect(canDisputeVerdict({ ...judged, mode: 'test', testing: true })).toBe(false);
  });

  it('bietet ihn nicht bei Hausaufgaben an: die werden geholfen, nicht bewertet', () => {
    expect(canDisputeVerdict({ ...judged, mode: 'help' })).toBe(false);
    expect(canDisputeVerdict({ ...judged, origin: 'homework' })).toBe(false);
  });

  it('bietet ihn in einer beendeten Sitzung nicht an', () => {
    expect(canDisputeVerdict({ ...judged, sessionStatus: 'finished' })).toBe(false);
  });
});

describe('der Knopf am Urteil', () => {
  it('sagt in ihren Worten, worum es geht — und nennt keine Zahl', () => {
    const onPress = vi.fn();
    renderInApp(<DisputeVerdictButton disabled={false} onPress={onPress} />);
    // Er heißt nach dem, was nicht stimmt — der Bewertung. „Frage passt nicht" ist der andere
    // Knopf und etwas anderes: der nimmt eine unpassende Frage raus, solange sie offen ist.
    const button = screen.getByRole('button', { name: 'Bewertung stimmt nicht' });
    // Nie eine Zahl: kein Zähler von Fälligem, Verpasstem oder Bestrittenem (Regel 6).
    expect(button.textContent ?? '').not.toMatch(/\d/);
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('wartet, während etwas anderes läuft, statt zweimal zu zählen', () => {
    const onPress = vi.fn();
    renderInApp(<DisputeVerdictButton disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Bewertung stimmt nicht' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('die Rückfrage', () => {
  function open(over: { busy?: boolean; onConfirm?: () => void; onClose?: () => void } = {}) {
    return renderInApp(
      <DisputeVerdictSheet
        visible
        busy={over.busy ?? false}
        onClose={over.onClose ?? (() => undefined)}
        onConfirm={over.onConfirm ?? (() => undefined)}
      />,
    );
  }

  it('sagt, was passiert, und behauptet nicht, dass sie recht hatte', () => {
    open();
    expect(screen.getByText('Stimmt die Bewertung nicht?')).toBeDefined();
    const body = screen.getByText(/Dann nehme ich diese Frage raus/).textContent ?? '';
    // Die drei Dinge, die der Server wirklich tut (practice/service.ts disputeVerdict).
    expect(body).toMatch(/zählt nicht/);
    expect(body).toMatch(/kommt nicht mehr dran/);
    expect(body).toMatch(/Lernstand bleibt, wie er vorher war/);
    // Und nichts darüber, wer recht hat: kein „richtig", kein „geprüft", keine Entschuldigung
    // für einen Fehler, den niemand nachgesehen hat (Regel 5).
    expect(body).not.toMatch(/richtig|geprüft|Fehler|Entschuldigung|sorry/i);
    expect(body).not.toMatch(/\d/);
  });

  it('ist kein Formular: ein Satz, ein Knopf, kein Feld zum Begründen', () => {
    open();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    // Der eine Weg weiter — und der sichtbare Weg heraus (Regel 14).
    expect(screen.getByRole('button', { name: 'Bewertung zurücknehmen' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeDefined();
  });

  it('gibt die Rücknahme weiter, wenn sie sie bestätigt', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    open({ onConfirm, onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Bewertung zurücknehmen' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('nimmt keinen zweiten Tipp an, solange die erste Rücknahme unterwegs ist', () => {
    const onConfirm = vi.fn();
    open({ busy: true, onConfirm });
    const confirm = screen.getByRole('button', { name: 'Bewertung zurücknehmen' });
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    // Er steht weiter da und sagt weiter, was er tut: nichts verschwindet unter ihr weg.
    expect(confirm.textContent).toBe('Bewertung zurücknehmen');
  });
});
