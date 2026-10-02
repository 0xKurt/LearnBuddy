// Die Notenzeile, auf die sie schreibt (issue #226). Festgehalten wird hier, was zwischen „es
// sieht aus wie Noten" und „sie kann damit schreiben" liegt:
//
//   · jede Stelle der Zeile ist ein echter Knopf, dessen NAME sagt, was er setzt und wo („H auf
//     der 3. Linie in Takt 1 setzen") — damit ist die Fläche auch mit dem Screenreader bedienbar,
//     und zwar auf genau demselben Weg und nicht auf einem zweiten daneben;
//   · ein Tipp **spielt den Ton sofort** — das ist die Rückmeldung, auf die es ankommt;
//   · die Zeile steht die ganze Zeit **in Worten** darunter, auch solange sie leer ist;
//   · „Zurück" nimmt das letzte Zeichen weg („rückgängig statt bestätigen");
//   · „Prüfen" bleibt aus, solange ein Takt leer ist, und was herausgeht, ist genau die Form,
//     die der Server zurückliest (`parseStaffLine`).
//
// Die Sätze stehen hier als deutsche Sätze und nicht als Schlüssel: die Texte kommen aus den
// echten Locale-Dateien, und was hier steht, ist, was sie liest und hört.
//
// Was diese Schicht nicht sehen kann: Geometrie und Klang. Dass die Fläche auf ein 360×740-Handy
// passt, misst der Browser (`tests/web/fit.ts`); dass die erzeugten Bytes die richtige Tonhöhe
// haben, misst `lib/music/__tests__/tone.test.ts`. Hier wird geprüft, DASS gespielt wird und mit
// welchem Ton — der Klangweg selbst ist ersetzt.

import { parseStaffLine, type StaffWriteSurface } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const played: Array<{ name: string; octave: number }> = [];
const lines: Array<{ bars: unknown; tempo: number }> = [];

// Der Klangweg wird ersetzt, nicht die Musik: `playPitch` und `playLine` sind die eigene Naht der
// App (`lib/music/play.ts`), und darunter liegt `expo-audio` — im Testbaum gibt es kein Audio.
vi.mock('../../../lib/music/play.js', () => ({
  playPitch: (pitch: { name: string; octave: number }) => {
    played.push(pitch);
    return { stop: () => undefined };
  },
  playLine: (bars: unknown, tempo: number) => {
    lines.push({ bars, tempo });
    return { stop: () => undefined };
  },
  stopNotes: () => undefined,
}));

const { emptyStaffAnswer, StaffAnswer, staffComplete, staffLineOf } =
  await import('../StaffAnswer.js');
const { renderInApp } = await import('../../../testing/render.js');

const SURFACE: StaffWriteSurface = {
  mode: 'notes',
  clef: 'treble',
  time: '4/4',
  bars: 1,
  tempo: 80,
};

/** Die Fläche mit ihrer Zeile, wie der Übungsbildschirm sie hält (State pro Frage). */
function show(surface: StaffWriteSurface = SURFACE, disabled = false) {
  const seen = { answer: emptyStaffAnswer(surface.bars) };
  function Harness() {
    const [answer, setAnswer] = useState(emptyStaffAnswer(surface.bars));
    seen.answer = answer;
    return (
      <StaffAnswer surface={surface} answer={answer} disabled={disabled} onChange={setAnswer} />
    );
  }
  renderInApp(<Harness />);
  return seen;
}

const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const choose = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));

beforeEach(() => {
  played.length = 0;
  lines.length = 0;
});

describe('eine Note setzen', () => {
  it('bietet jede Stelle der Zeile als eigenen Knopf an, mit Ton UND Ort im Namen', () => {
    show();
    // Dreizehn Stellen: eine Hilfslinie unter der Zeile, die fünf Linien, ihre vier
    // Zwischenräume und eine Hilfslinie darüber.
    expect(screen.getAllByRole('button', { name: /in Takt 1 setzen$/ })).toHaveLength(13);
    // Der Violinschlüssel, von unten abgezählt — und der Ort steht dabei, weil derselbe Ton
    // zweimal vorkommt (E auf der 1. Linie und im 4. Zwischenraum).
    for (const name of [
      'E auf der 1. Linie in Takt 1 setzen',
      'F im 1. Zwischenraum in Takt 1 setzen',
      'G auf der 2. Linie in Takt 1 setzen',
      'H auf der 3. Linie in Takt 1 setzen',
      'D auf der 4. Linie in Takt 1 setzen',
      'F auf der 5. Linie in Takt 1 setzen',
      'E im 4. Zwischenraum in Takt 1 setzen',
      'C unter der Zeile in Takt 1 setzen',
      'A über der Zeile in Takt 1 setzen',
    ]) {
      expect(screen.getByRole('button', { name }), name).toBeTruthy();
    }
  });

  it('spielt die Note, die sie getroffen hat, und schreibt sie in die Zeile', () => {
    const seen = show();
    // Die mittlere Linie des Violinschlüssels ist das H.
    tap('H auf der 3. Linie in Takt 1 setzen');
    expect(seen.answer.bars[0]).toEqual([
      { el: 'note', pitch: { name: 'B', octave: 4 }, value: 'quarter', dotted: false },
    ]);
    // Sofort gehört, nicht erst bei „Prüfen" (issue #226).
    expect(played).toEqual([{ name: 'B', octave: 4 }]);
  });

  it('sagt die ganze Zeile in Worten, auch solange sie leer ist', () => {
    show();
    expect(screen.getByText('Takt 1: noch leer')).toBeTruthy();
    tap('H auf der 3. Linie in Takt 1 setzen');
    expect(screen.getByText('Takt 1: H als Viertelnote')).toBeTruthy();
  });

  it('nimmt den gewählten Wert und den Punkt mit', () => {
    const seen = show();
    choose('halbe Note');
    tap('Punkt');
    tap('G auf der 2. Linie in Takt 1 setzen');
    expect(seen.answer.bars[0]?.[0]).toMatchObject({ value: 'half', dotted: true });
    expect(screen.getByText('Takt 1: G als punktierte halbe Note')).toBeTruthy();
  });

  it('setzt eine Pause ohne Tonhöhe und spielt dafür nichts', () => {
    const seen = show();
    tap('Pause');
    expect(seen.answer.bars[0]?.[0]).toEqual({ el: 'rest', value: 'quarter', dotted: false });
    expect(played).toEqual([]);
    expect(screen.getByText('Takt 1: Viertelpause')).toBeTruthy();
  });

  it('nimmt mit Zurück das letzte Zeichen weg', () => {
    const seen = show();
    tap('E auf der 1. Linie in Takt 1 setzen');
    tap('G auf der 2. Linie in Takt 1 setzen');
    expect(seen.answer.bars[0]).toHaveLength(2);
    tap('Zurück');
    expect(seen.answer.bars[0]).toHaveLength(1);
    expect(seen.answer.bars[0]?.[0]).toMatchObject({ pitch: { name: 'E', octave: 4 } });
  });
});

describe('das Kreuz', () => {
  it('benennt und setzt den erhöhten Ton, und lässt ihn weg, wo es keinen gibt', () => {
    const seen = show();
    tap('Kreuz ♯');
    // Der Schalter sagt im Namen, dass er an ist — die Farbe ist nie das einzige Signal.
    expect(screen.getByRole('button', { name: 'Kreuz ♯, ist an' })).toBeTruthy();
    // Auf dem F gibt es ein Fis …
    expect(
      screen.getByRole('button', { name: 'Fis auf der 5. Linie in Takt 1 setzen' }),
    ).toBeTruthy();
    // … auf dem E nicht: „Eis" gehört nicht zu den zwölf Namen, und der Knopf sagt deshalb
    // weiter E, statt etwas zu versprechen, was er nicht setzt.
    expect(
      screen.getByRole('button', { name: 'E auf der 1. Linie in Takt 1 setzen' }),
    ).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Eis/ })).toEqual([]);
    tap('Fis auf der 5. Linie in Takt 1 setzen');
    expect(seen.answer.bars[0]?.[0]).toMatchObject({ pitch: { name: 'F#', octave: 5 } });
    expect(played[0]).toEqual({ name: 'F#', octave: 5 });
  });
});

describe('was herausgeht', () => {
  it('bleibt unprüfbar, solange ein Takt leer ist', () => {
    const two: StaffWriteSurface = { ...SURFACE, time: '2/4', bars: 2 };
    const seen = show(two);
    expect(staffComplete(seen.answer)).toBe(false);
    tap('H auf der 3. Linie in Takt 1 setzen');
    expect(staffComplete(seen.answer)).toBe(false);
    tap('H auf der 3. Linie in Takt 2 setzen');
    expect(staffComplete(seen.answer)).toBe(true);
  });

  it('schickt genau die Form, die der Server zurückliest', () => {
    const two: StaffWriteSurface = { ...SURFACE, time: '2/4', bars: 2 };
    const seen = show(two);
    choose('halbe Note');
    tap('H auf der 3. Linie in Takt 1 setzen');
    tap('D auf der 4. Linie in Takt 2 setzen');
    const line = staffLineOf(seen.answer);
    expect(line).toBe('B4h | D5h');
    // Der Server liest sie mit derselben Funktion zurück, mit der die App sie schreibt.
    expect(parseStaffLine(line)).toEqual(seen.answer.bars);
  });

  it('spielt ihre eigene Zeile, sobald etwas darin steht', () => {
    show();
    // Ohne Zeichen gibt es nichts zu hören, und der Knopf ist aus.
    expect(screen.getByRole('button', { name: 'Anhören' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    tap('H auf der 3. Linie in Takt 1 setzen');
    tap('Anhören');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.tempo).toBe(80);
    expect(lines[0]?.bars).toEqual([
      [{ el: 'note', pitch: { name: 'B', octave: 4 }, value: 'quarter', dotted: false }],
    ]);
  });
});

describe('wenn die Frage zu ist', () => {
  it('lässt nichts mehr setzen', () => {
    const seen = show(SURFACE, true);
    tap('H auf der 3. Linie in Takt 1 setzen');
    expect(seen.answer.bars[0]).toHaveLength(0);
    expect(played).toEqual([]);
  });
});
