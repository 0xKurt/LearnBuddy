// Die Notenzeile, auf die sie schreibt (issues #226, #275). Festgehalten wird hier, was zwischen
// „es sieht aus wie Noten" und „sie kann damit schreiben" liegt:
//
//   · jeder Takt ist EIN großes Tippziel, dessen Name sagt, was schon darin steht („Takt 1: noch
//     leer") — und ein Tipp ohne Fingerposition (Screenreader, Tastatur) setzt die Note auf die
//     mittlere Linie, von wo „Höher" und „Tiefer" sie an ihren Platz schieben: ein Weg für alle;
//   · ein Tipp und jeder Schritt **spielen den Ton sofort** — das ist die Rückmeldung;
//   · „Höher"/„Tiefer" bewegen nur die zuletzt gesetzte NOTE, nie eine Pause, und halten an der
//     Hilfslinie an;
//   · „Zurück" nimmt das letzte Zeichen weg („rückgängig statt bestätigen");
//   · „Prüfen" bleibt aus, solange ein Takt leer ist, und was herausgeht, ist genau die Form,
//     die der Server zurückliest (`parseStaffLine`).
//
// Die Sätze stehen hier als deutsche Sätze und nicht als Schlüssel: die Texte kommen aus den
// echten Locale-Dateien, und was hier steht, ist, was sie liest und hört.
//
// Was diese Schicht nicht sehen kann: Geometrie und Klang. Dass ein Tipp auf eine Linie dort
// landet und die Fläche auf ein 360×740-Handy passt, misst der Browser (`tests/web/modes.spec.ts`,
// `tests/web/fit.ts`) — der Testbaum hat keinen Rahmen und damit keine Fingerposition. Dass die
// erzeugten Bytes die richtige Tonhöhe haben, misst `lib/music/__tests__/tone.test.ts`.

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
const { StaffKeys } = await import('../StaffKeys.js');
const { renderInApp } = await import('../../../testing/render.js');

const SURFACE: StaffWriteSurface = {
  mode: 'notes',
  clef: 'treble',
  time: '4/4',
  bars: 1,
  tempo: 80,
};

/**
 * Die Fläche mit ihrer Zeile und ihren Tasten, wie der Übungsbildschirm sie hält (State pro Frage;
 * die Tasten stehen dort im `keys`-Platz der Antworthülle, issue #310).
 */
function show(surface: StaffWriteSurface = SURFACE, disabled = false) {
  const seen = { answer: emptyStaffAnswer(surface.bars) };
  function Harness() {
    const [answer, setAnswer] = useState(emptyStaffAnswer(surface.bars));
    seen.answer = answer;
    return (
      <>
        <StaffAnswer surface={surface} answer={answer} disabled={disabled} onChange={setAnswer} />
        <StaffKeys surface={surface} answer={answer} disabled={disabled} onChange={setAnswer} />
      </>
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

const BAR1 = 'Takt 1: noch leer';

describe('eine Note setzen', () => {
  it('bietet jeden Takt als EIN Tippziel an, das sagt, was darin steht', () => {
    show({ ...SURFACE, time: '2/4', bars: 2 });
    expect(screen.getByRole('button', { name: 'Takt 1: noch leer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Takt 2: noch leer' })).toBeTruthy();
    // Keine dreizehn Streifen à 11 pt mehr (issue #275).
    expect(screen.queryAllByRole('button', { name: /in Takt \d setzen$/ })).toEqual([]);
  });

  it('setzt ohne Fingerposition auf die mittlere Linie, spielt sie und nennt den Takt neu', () => {
    const seen = show();
    tap(BAR1);
    // Die mittlere Linie des Violinschlüssels ist das H.
    expect(seen.answer.bars[0]).toEqual([
      { el: 'note', pitch: { name: 'B', octave: 4 }, value: 'quarter', dotted: false },
    ]);
    // Sofort gehört, nicht erst bei „Prüfen" (issue #226).
    expect(played).toEqual([{ name: 'B', octave: 4 }]);
    expect(screen.getByRole('button', { name: 'Takt 1: H als Viertelnote' })).toBeTruthy();
  });

  it('schiebt die gesetzte Note mit Höher und Tiefer, und jeder Schritt klingt', () => {
    const seen = show();
    expect(screen.getByRole('button', { name: 'Höher' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    tap(BAR1);
    tap('Tiefer');
    tap('Tiefer');
    tap('Tiefer');
    // H → A → G → F: dreimal eine Stelle tiefer, auf den ersten Zwischenraum.
    expect(seen.answer.bars[0]?.[0]).toMatchObject({ pitch: { name: 'F', octave: 4 } });
    expect(played).toEqual([
      { name: 'B', octave: 4 },
      { name: 'A', octave: 4 },
      { name: 'G', octave: 4 },
      { name: 'F', octave: 4 },
    ]);
    tap('Höher');
    expect(seen.answer.bars[0]?.[0]).toMatchObject({ pitch: { name: 'G', octave: 4 } });
    // Es bleibt EINE Note: schieben ist nicht noch einmal setzen.
    expect(seen.answer.bars[0]).toHaveLength(1);
  });

  it('hält an der Hilfslinie an', () => {
    const seen = show();
    tap(BAR1);
    for (let i = 0; i < 8; i++) {
      if (screen.getByRole('button', { name: 'Tiefer' }).getAttribute('aria-disabled') === 'true')
        break;
      tap('Tiefer');
    }
    // Sechs Stellen unter dem H: das C auf der Hilfslinie, und weiter geht es nicht.
    expect(seen.answer.bars[0]?.[0]).toMatchObject({ pitch: { name: 'C', octave: 4 } });
    expect(screen.getByRole('button', { name: 'Tiefer' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('bewegt nur die zuletzt gesetzte Note, und nach einer Pause nichts', () => {
    const seen = show();
    tap(BAR1);
    tap('Höher');
    tap('Takt 1: C als Viertelnote');
    tap('Tiefer');
    expect(seen.answer.bars[0]?.map((el) => (el.el === 'note' ? el.pitch.name : 'R'))).toEqual([
      'C',
      'A',
    ]);
    tap('Viertelpause setzen');
    expect(screen.getByRole('button', { name: 'Höher' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('nimmt den gewählten Wert und den Punkt mit', () => {
    const seen = show();
    choose('halbe Note');
    tap('Punkt');
    tap(BAR1);
    expect(seen.answer.bars[0]?.[0]).toMatchObject({ value: 'half', dotted: true });
    expect(
      screen.getByRole('button', { name: 'Takt 1: H als punktierte halbe Note' }),
    ).toBeTruthy();
  });

  it('setzt eine Pause ohne Tonhöhe und spielt dafür nichts', () => {
    const seen = show();
    tap('Viertelpause setzen');
    expect(seen.answer.bars[0]?.[0]).toEqual({ el: 'rest', value: 'quarter', dotted: false });
    expect(played).toEqual([]);
    expect(screen.getByRole('button', { name: 'Takt 1: Viertelpause' })).toBeTruthy();
  });

  it('nimmt mit Zurück das letzte Zeichen weg', () => {
    const seen = show();
    tap(BAR1);
    tap('Takt 1: H als Viertelnote');
    expect(seen.answer.bars[0]).toHaveLength(2);
    tap('Zurück');
    expect(seen.answer.bars[0]).toHaveLength(1);
  });

  it('sagt die ganze Zeile für den Screenreader in Worten, auch solange sie leer ist', () => {
    show();
    expect(screen.getByText('Takt 1: noch leer')).toBeTruthy();
  });
});

describe('das Kreuz', () => {
  it('setzt den erhöhten Ton, und lässt ihn weg, wo es keinen gibt', () => {
    const seen = show();
    tap('Kreuz ♯');
    // Der Schalter sagt im Namen, dass er an ist — die Farbe ist nie das einzige Signal.
    expect(screen.getByRole('button', { name: 'Kreuz ♯, ist an' })).toBeTruthy();
    tap(BAR1);
    // Auf dem H gibt es kein „His": es bleibt H …
    expect(seen.answer.bars[0]?.[0]).toMatchObject({ pitch: { name: 'B', octave: 4 } });
    // … eine Stelle tiefer liegt das A, und dort gibt es ein Ais.
    tap('Tiefer');
    expect(seen.answer.bars[0]?.[0]).toMatchObject({ pitch: { name: 'A#', octave: 4 } });
    expect(played[1]).toEqual({ name: 'A#', octave: 4 });
  });
});

describe('was herausgeht', () => {
  it('bleibt unprüfbar, solange ein Takt leer ist', () => {
    const two: StaffWriteSurface = { ...SURFACE, time: '2/4', bars: 2 };
    const seen = show(two);
    expect(staffComplete(seen.answer)).toBe(false);
    tap('Takt 1: noch leer');
    expect(staffComplete(seen.answer)).toBe(false);
    tap('Takt 2: noch leer');
    expect(staffComplete(seen.answer)).toBe(true);
  });

  it('schickt genau die Form, die der Server zurückliest', () => {
    const two: StaffWriteSurface = { ...SURFACE, time: '2/4', bars: 2 };
    const seen = show(two);
    choose('halbe Note');
    tap('Takt 1: noch leer');
    tap('Takt 2: noch leer');
    tap('Höher');
    tap('Höher');
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
    tap(BAR1);
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
    tap(BAR1);
    expect(seen.answer.bars[0]).toHaveLength(0);
    expect(played).toEqual([]);
  });
});
