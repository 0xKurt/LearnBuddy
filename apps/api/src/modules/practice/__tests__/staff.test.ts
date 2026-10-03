// Was an einer Notenzeile rechenbar ist, rechnet Code nach (issue #226, Abnahme 1).
//
// Vier Dinge prüft diese Datei, und jedes ist eine Zusage aus dem Issue:
//
//   1. **Tonhöhe → Linie, in beiden Schlüsseln.** Die Zuordnung ist die Grundlage von allem
//      anderen, und sie wird gegen die Tatsachen geprüft, die in jedem Musikbuch stehen: das
//      mittlere C liegt im Violinschlüssel eine Hilfslinie UNTER der Zeile und im Bassschlüssel
//      eine Hilfslinie DARÜBER — dieselbe Note, zwei Orte.
//   2. **Intervall und Taktfüllung werden gerechnet**, nicht behauptet.
//   3. **Ein Parametersatz, aus dem keine Frage folgt, ergibt keine Frage.** Kein Schlüssel
//      kann der gezeichneten Zeile widersprechen, weil beide aus demselben Objekt kommen —
//      geprüft wird hier, dass die Ablehnungen wirklich greifen.
//   4. **Eine geschriebene Zeile wird Zeichen für Zeichen verglichen**, mit einer genannten
//      Stelle und ohne Modell.

import {
  barTicks,
  canSharp,
  diatonicOf,
  dottedRestOk,
  frequencyOf,
  intervalBetween,
  onStaff,
  parseStaffLine,
  pitchAtStep,
  renderStaffLine,
  semitonesOf,
  staffStep,
  TICKS,
  ticksOf,
  type Clef,
  type NoteName,
  type Pitch,
  type StaffBars,
  type StaffTask,
  type TimeSignature,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  checkStaffLine,
  intervalWord,
  noteWord,
  staffAgain,
  staffItem,
  staffItems,
  staffLineReply,
  staffLabels,
  staffSurfaceOf,
  usableStaffTask,
  visibleLabels,
  writtenStaffLine,
  MAX_STAFF_ITEMS,
} from '../staff.js';
import { mentionsSolution } from '../tutor.js';

const p = (name: NoteName, octave: number): Pitch => ({ name, octave });

/** Eine Zeile aus Vierteln, so wie eine Aufgabe sie schreibt. */
function quarters(...pitches: Pitch[]): StaffBars {
  return [
    pitches.map((pitch) => ({
      el: 'note' as const,
      pitch,
      value: 'quarter' as const,
      dotted: false,
    })),
  ];
}

describe('Tonhöhe und Linie', () => {
  it('legt die mittleren Linien fest, wie jedes Musikbuch sie kennt', () => {
    expect(staffStep(p('B', 4), 'treble')).toBe(0);
    expect(staffStep(p('D', 3), 'bass')).toBe(0);
    // Die fünf Linien von unten nach oben.
    expect(pitchAtStep(-4, 'treble')).toEqual(p('E', 4));
    expect(pitchAtStep(-2, 'treble')).toEqual(p('G', 4));
    expect(pitchAtStep(2, 'treble')).toEqual(p('D', 5));
    expect(pitchAtStep(4, 'treble')).toEqual(p('F', 5));
    expect(pitchAtStep(-4, 'bass')).toEqual(p('G', 2));
    expect(pitchAtStep(-2, 'bass')).toEqual(p('B', 2));
    // Die vierte Linie von unten ist die F-Linie — die, die der Bassschlüssel festlegt.
    expect(pitchAtStep(2, 'bass')).toEqual(p('F', 3));
    expect(pitchAtStep(4, 'bass')).toEqual(p('A', 3));
  });

  it('setzt das mittlere C in beiden Schlüsseln auf seine Hilfslinie', () => {
    // Dieselbe Note, und sie liegt im Violinschlüssel unter und im Bassschlüssel über der Zeile.
    expect(staffStep(p('C', 4), 'treble')).toBe(-6);
    expect(staffStep(p('C', 4), 'bass')).toBe(6);
    expect(onStaff(p('C', 4), 'treble')).toBe(true);
    expect(onStaff(p('C', 4), 'bass')).toBe(true);
  });

  it('lässt nur eine Hilfslinie zu, in beide Richtungen', () => {
    expect(onStaff(p('B', 3), 'treble')).toBe(false);
    expect(onStaff(p('A', 5), 'treble')).toBe(true);
    expect(onStaff(p('B', 5), 'treble')).toBe(false);
    expect(onStaff(p('E', 2), 'bass')).toBe(true);
    expect(onStaff(p('D', 2), 'bass')).toBe(false);
    expect(onStaff(p('D', 4), 'bass')).toBe(false);
  });

  it('setzt ein Kreuz auf die Linie seines Stammtons', () => {
    for (const clef of ['treble', 'bass'] as Clef[]) {
      expect(staffStep(p('C#', 4), clef)).toBe(staffStep(p('C', 4), clef));
      expect(staffStep(p('F#', 5), clef)).toBe(staffStep(p('F', 5), clef));
    }
    // Und es klingt einen Halbton höher, obwohl es dieselbe Linie ist.
    expect(semitonesOf(p('C#', 4)) - semitonesOf(p('C', 4))).toBe(1);
    expect(diatonicOf(p('C#', 4))).toBe(diatonicOf(p('C', 4)));
  });

  it('kennt jede Stufe als Ton und jeden Ton als Stufe (hin und zurück)', () => {
    for (const clef of ['treble', 'bass'] as Clef[]) {
      for (let step = -6; step <= 6; step++) {
        expect(staffStep(pitchAtStep(step, clef), clef)).toBe(step);
      }
    }
  });

  it('weiß, wo es kein Kreuz gibt', () => {
    // „Eis" und „His" gehören nicht zu den zwölf Namen, also kann die Taste dort nichts tun.
    expect(canSharp(staffStep(p('E', 4), 'treble'), 'treble')).toBe(false);
    expect(canSharp(staffStep(p('B', 4), 'treble'), 'treble')).toBe(false);
    expect(canSharp(staffStep(p('C', 5), 'treble'), 'treble')).toBe(true);
    expect(canSharp(staffStep(p('F', 4), 'treble'), 'treble')).toBe(true);
  });

  it('stimmt A4 auf 440 Hz und rechnet die anderen daraus', () => {
    expect(frequencyOf(p('A', 4))).toBe(440);
    expect(frequencyOf(p('A', 5))).toBeCloseTo(880, 9);
    expect(frequencyOf(p('C', 4))).toBeCloseTo(261.6255653, 6);
    expect(frequencyOf(p('A#', 4)) / frequencyOf(p('A', 4))).toBeCloseTo(Math.pow(2, 1 / 12), 12);
  });
});

describe('Intervalle', () => {
  it('rechnet Stufe und Halbtöne zusammen zu einem Namen', () => {
    expect(intervalBetween(p('C', 4), p('G', 4))).toEqual({ step: 5, quality: 'perfect' });
    expect(intervalBetween(p('C', 4), p('E', 4))).toEqual({ step: 3, quality: 'major' });
    expect(intervalBetween(p('E', 4), p('G', 4))).toEqual({ step: 3, quality: 'minor' });
    expect(intervalBetween(p('C', 4), p('C', 5))).toEqual({ step: 8, quality: 'perfect' });
    expect(intervalBetween(p('D', 4), p('A', 4))).toEqual({ step: 5, quality: 'perfect' });
    expect(intervalBetween(p('C', 4), p('D', 4))).toEqual({ step: 2, quality: 'major' });
    expect(intervalBetween(p('E', 4), p('F', 4))).toEqual({ step: 2, quality: 'minor' });
  });

  it('gibt keinem Intervall einen Namen, den es auf dieser Stufe nicht gibt', () => {
    // Tritonus (übermäßige Quarte) und übermäßige Sekunde: richtige Intervalle, aber ihre Namen
    // heißen nicht „rein", „groß" oder „klein" — ein Schlüssel dafür wäre eine Behauptung.
    expect(intervalBetween(p('C', 4), p('F#', 4))).toBeNull();
    expect(intervalBetween(p('C', 4), p('D#', 4))).toBeNull();
    // Verminderte Quinte.
    expect(intervalBetween(p('C#', 4), p('G', 4))).toBeNull();
    // Der obere Ton liegt nicht über dem unteren, oder es ist derselbe.
    expect(intervalBetween(p('G', 4), p('C', 4))).toBeNull();
    expect(intervalBetween(p('C', 4), p('C', 4))).toBeNull();
    // Über die Oktave hinaus.
    expect(intervalBetween(p('C', 4), p('D', 5))).toBeNull();
  });
});

describe('Dauern und Takte', () => {
  it('zählt jede Dauer als ganze Zahl von Zweiunddreißigsteln', () => {
    expect(TICKS.quarter).toBe(8);
    expect(ticksOf('quarter', true)).toBe(12);
    expect(ticksOf('sixteenth', true)).toBe(3);
    expect(ticksOf('whole', false)).toBe(32);
  });

  it('weiß, wie viel in einen Takt passt', () => {
    const want: Record<TimeSignature, number> = {
      '2/4': 16,
      '3/4': 24,
      '4/4': 32,
      '3/8': 12,
      '6/8': 24,
      '2/2': 32,
    };
    for (const [time, ticks] of Object.entries(want)) {
      expect(barTicks(time as TimeSignature), time).toBe(ticks);
    }
  });

  it('erlaubt keine punktierte ganze oder halbe Pause', () => {
    expect(dottedRestOk('whole')).toBe(false);
    expect(dottedRestOk('half')).toBe(false);
    expect(dottedRestOk('quarter')).toBe(true);
  });
});

describe('welche Aufgabe keine Frage wird', () => {
  it('verwirft eine Note, die nicht auf der gezeichneten Zeile liegt', () => {
    const off: StaffTask = { task: 'name_note', clef: 'treble', pitch: p('B', 3) };
    expect(usableStaffTask(off)).toBeNull();
    expect(staffItem(off, 'de')).toBeNull();
    expect(usableStaffTask({ task: 'name_note', clef: 'treble', pitch: p('C', 4) })).not.toBeNull();
  });

  it('verwirft ein Intervall ohne eindeutigen Namen und eines in der falschen Richtung', () => {
    const tritone: StaffTask = {
      task: 'interval',
      clef: 'treble',
      lower: p('C', 4),
      upper: p('F#', 4),
    };
    const down: StaffTask = {
      task: 'interval',
      clef: 'treble',
      lower: p('G', 4),
      upper: p('E', 4),
    };
    expect(staffItem(tritone, 'de')).toBeNull();
    expect(staffItem(down, 'de')).toBeNull();
  });

  it('verwirft eine Taktart, deren Werte den Takt nicht füllen', () => {
    const short: StaffTask = {
      task: 'time_signature',
      clef: 'treble',
      time: '4/4',
      // Drei Viertel in einem Viervierteltakt: das Modell hat sich verzählt.
      bars: quarters(p('C', 4), p('E', 4), p('G', 4)),
    };
    expect(staffItem(short, 'de')).toBeNull();
    const full: StaffTask = {
      ...short,
      bars: quarters(p('C', 4), p('E', 4), p('G', 4), p('E', 4)),
    };
    expect(staffItem(full, 'de')).not.toBeNull();
  });

  it('fragt nicht nach einer Taktart, die eine andere gleich lang macht', () => {
    // 3/4 und 6/8 füllen einen Takt mit denselben 24 Zweiunddreißigsteln, 4/4 und 2/2 mit 32:
    // ohne Balkung gäbe es zwei richtige Antworten.
    const six: StaffTask = {
      task: 'time_signature',
      clef: 'treble',
      time: '6/8',
      bars: [
        Array.from({ length: 6 }, () => ({
          el: 'note' as const,
          pitch: p('G', 4),
          value: 'eighth' as const,
          dotted: false,
        })),
      ],
    };
    expect(barTicks('6/8')).toBe(barTicks('3/4'));
    expect(staffItem(six, 'de')).toBeNull();
    const alla: StaffTask = {
      task: 'time_signature',
      clef: 'treble',
      time: '2/2',
      bars: [
        [
          { el: 'note', pitch: p('G', 4), value: 'half', dotted: false },
          { el: 'note', pitch: p('E', 4), value: 'half', dotted: false },
        ],
      ],
    };
    expect(staffItem(alla, 'de')).toBeNull();
  });

  it('verwirft eine Schreibaufgabe, die so nicht zu schreiben ist', () => {
    const base = { task: 'write_line' as const, clef: 'treble' as const, time: '4/4' as const };
    // Ein Takt, der nicht aufgeht.
    expect(staffItem({ ...base, bars: quarters(p('C', 5), p('E', 5)) }, 'de')).toBeNull();
    // Ein einzelnes Zeichen ist keine Zeile.
    expect(
      staffItem(
        { ...base, bars: [[{ el: 'note', pitch: p('C', 5), value: 'whole', dotted: false }]] },
        'de',
      ),
    ).toBeNull();
    // Eine Note, die eine Hilfslinie braucht: zum Lesen erlaubt, zum Schreiben nicht.
    expect(onStaff(p('C', 4), 'treble')).toBe(true);
    expect(
      staffItem({ ...base, bars: quarters(p('C', 4), p('E', 4), p('G', 4), p('E', 4)) }, 'de'),
    ).toBeNull();
    // Und die Zeile, die wirklich geht.
    expect(
      staffItem({ ...base, bars: quarters(p('D', 5), p('E', 5), p('F', 5), p('G', 5)) }, 'de'),
    ).not.toBeNull();
  });

  it('verwirft eine punktierte ganze Pause', () => {
    const task: StaffTask = {
      task: 'name_value',
      clef: 'treble',
      value: 'whole',
      dotted: true,
      rest: true,
    };
    expect(staffItem(task, 'de')).toBeNull();
    expect(staffItem({ ...task, rest: false }, 'de')).not.toBeNull();
  });

  it('nimmt höchstens MAX_STAFF_ITEMS und lässt nur fallen, was keine Aufgabe ist', () => {
    const asked: StaffTask[] = [
      { task: 'name_note', clef: 'treble', pitch: p('G', 4) },
      { task: 'name_note', clef: 'treble', pitch: p('B', 3) }, // keine Aufgabe: nicht auf der Zeile
      { task: 'interval', clef: 'bass', lower: p('G', 2), upper: p('D', 3) },
      { task: 'name_value', clef: 'treble', value: 'eighth', dotted: false, rest: false },
    ];
    const items = staffItems(asked, 'de');
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.staff_task)).toEqual([asked[0], asked[2], asked[3]]);
    // Und die Obergrenze bleibt eine: mehr Aufgaben als erlaubt werden abgeschnitten, nie
    // zusammengefasst.
    const many = Array.from({ length: MAX_STAFF_ITEMS + 4 }, () => asked[0] as StaffTask);
    expect(staffItems(many, 'de')).toHaveLength(MAX_STAFF_ITEMS);
  });
});

describe('die Frage, die eine Aufgabe wird', () => {
  const tasks: StaffTask[] = [
    { task: 'name_note', clef: 'treble', pitch: p('G', 4) },
    { task: 'name_note', clef: 'bass', pitch: p('F', 3) },
    { task: 'name_value', clef: 'treble', value: 'quarter', dotted: true, rest: false },
    { task: 'name_value', clef: 'treble', value: 'quarter', dotted: false, rest: true },
    { task: 'interval', clef: 'treble', lower: p('C', 5), upper: p('G', 5) },
    { task: 'interval', clef: 'bass', lower: p('A', 2), upper: p('C', 3) },
    {
      task: 'time_signature',
      clef: 'treble',
      time: '3/4',
      bars: quarters(p('E', 4), p('G', 4), p('E', 4)),
    },
    {
      task: 'write_line',
      clef: 'treble',
      time: '4/4',
      bars: quarters(p('E', 4), p('G', 4), p('B', 4), p('G', 4)),
    },
  ];

  it('schreibt jede Frage vollständig: Text, Optionen, Schlüssel, Tipps, Lösung', () => {
    for (const task of tasks) {
      const item = staffItem(task, 'de');
      expect(item, task.task).not.toBeNull();
      if (!item) continue;
      expect(item.prompt.length).toBeGreaterThan(5);
      expect(item.topic).toBeTruthy();
      expect(item.answer.length).toBeGreaterThan(0);
      expect(item.hints.length).toBeGreaterThanOrEqual(2);
      expect(item.worked_solution).toBeTruthy();
      expect(item.staff_task).toEqual(task);
      // Nichts von dem, was ein einwertiges Textitem braucht, steht hier doppelt.
      expect(item.accepted_answers).toEqual([]);
      // Kein Tipp verrät die Lösung — hier geprüft mit derselben Funktion, mit der der Server
      // einen vom Modell geschriebenen Tipp wegwirft.
      for (const hint of item.hints) {
        expect(mentionsSolution(hint, item.answer, item.prompt), hint).toBe(false);
      }
    }
  });

  it('gibt jeder Lesefrage vier verschiedene Optionen und zeigt auf die richtige', () => {
    for (const task of tasks.filter((x) => x.task !== 'write_line')) {
      const item = staffItem(task, 'de');
      if (!item) continue;
      expect(item.kind).toBe('multiple_choice');
      expect(item.choices).toHaveLength(4);
      expect(new Set(item.choices).size).toBe(4);
      expect(item.correct_choice).not.toBeNull();
      expect(item.choices?.[item.correct_choice as number]).toBe(item.answer);
    }
  });

  it('macht den Schlüssel aus der gezeichneten Zeile, nicht neben ihr', () => {
    // Das ist die Zusage des Issues: „Der Schlüssel muss zur gezeichneten Zeile passen."
    // Hier ist sie stärker — er ist AUS ihr gerechnet, also kann er ihr nicht widersprechen.
    const note = staffItem({ task: 'name_note', clef: 'bass', pitch: p('F', 3) }, 'de');
    expect(note?.answer).toBe(noteWord('de', 'F'));
    expect(note?.figure).toEqual({
      type: 'staff',
      clef: 'bass',
      time: null,
      bars: [[{ el: 'note', pitch: p('F', 3), value: 'quarter', dotted: false }]],
      tempo: 80,
      // Ihr Name ist die Antwort: unbeschriftet (issue #312).
      labels: [],
    });

    const fifth = staffItem(
      { task: 'interval', clef: 'treble', lower: p('C', 5), upper: p('G', 5) },
      'de',
    );
    expect(fifth?.answer).toBe(intervalWord('de', { step: 5, quality: 'perfect' }));
    expect(fifth?.answer).toBe('reine Quinte');

    const third = staffItem(
      { task: 'interval', clef: 'bass', lower: p('A', 2), upper: p('C', 3) },
      'de',
    );
    expect(third?.answer).toBe('kleine Terz');
  });

  it('zeichnet eine Taktart-Frage ohne ihre Taktart', () => {
    const item = staffItem(
      {
        task: 'time_signature',
        clef: 'treble',
        time: '3/4',
        bars: quarters(p('E', 4), p('G', 4), p('E', 4)),
      },
      'de',
    );
    expect(item?.answer).toBe('3/4');
    expect(item?.figure?.type).toBe('staff');
    // Die Lösung stünde sonst gezeichnet am Anfang der Zeile.
    expect(item?.figure && 'time' in item.figure ? item.figure.time : 'x').toBeNull();
    expect(item?.choices).toContain('3/4');
    expect(item?.choices).not.toContain('6/8');
  });

  it('gibt einer Schreibaufgabe eine leere Zeile und nennt die Töne in Worten', () => {
    const task: StaffTask = {
      task: 'write_line',
      clef: 'treble',
      time: '4/4',
      bars: quarters(p('E', 4), p('G', 4), p('B', 4), p('G', 4)),
    };
    const item = staffItem(task, 'de');
    expect(item?.kind).toBe('short');
    // Keine Figur: die Zeile, auf die sie schreibt, IST die Fläche.
    expect(item?.figure).toBeNull();
    expect(item?.prompt).toContain('Violinschlüssel');
    expect(item?.prompt).toContain('Viervierteltakt');
    expect(item?.prompt).toContain('E als Viertelnote');
    // Der Schlüssel ist die Zeile in Worten, damit „Lösung zeigen" etwas Lesbares zeigt.
    expect(item?.answer).toBe(
      'E als Viertelnote, G als Viertelnote, H als Viertelnote, G als Viertelnote',
    );
    expect(staffSurfaceOf(task)).toEqual({
      mode: 'notes',
      clef: 'treble',
      time: '4/4',
      bars: 1,
      tempo: 80,
    });
    // Und jede andere Notenaufgabe hat keine Fläche: die wird angetippt.
    expect(staffSurfaceOf({ task: 'name_note', clef: 'treble', pitch: p('G', 4) })).toBeNull();
  });
});

describe('eine geschriebene Zeile prüfen', () => {
  const task: StaffTask = {
    task: 'write_line',
    clef: 'treble',
    time: '4/4',
    bars: [
      [
        { el: 'note', pitch: p('E', 4), value: 'quarter', dotted: false },
        { el: 'note', pitch: p('G', 4), value: 'quarter', dotted: false },
        { el: 'note', pitch: p('B', 4), value: 'half', dotted: false },
      ],
    ],
  };
  const right = renderStaffLine(task.task === 'write_line' ? task.bars : []);

  it('liest eine Zeile hin und zurück und weist zurück, was keine ist', () => {
    expect(right).toBe('E4q G4q B4h');
    expect(parseStaffLine(right)).toEqual(task.task === 'write_line' ? task.bars : []);
    expect(parseStaffLine('C#4q. Re | Rq Rq')).toEqual([
      [
        { el: 'note', pitch: p('C#', 4), value: 'quarter', dotted: true },
        { el: 'rest', value: 'eighth', dotted: false },
      ],
      [
        { el: 'rest', value: 'quarter', dotted: false },
        { el: 'rest', value: 'quarter', dotted: false },
      ],
    ]);
    expect(parseStaffLine('')).toBeNull();
    expect(parseStaffLine('H4q')).toBeNull();
    expect(parseStaffLine('E9q')).toBeNull();
    expect(parseStaffLine('E4x')).toBeNull();
    expect(parseStaffLine('irgendwas')).toBeNull();
  });

  it('nennt die richtige Zeile richtig, in jeder Oktave desselben Namens', () => {
    const exact = checkStaffLine(task, right);
    expect(exact).toEqual({ held: 3, total: 3, verdict: 'correct', fault: null });
    // Die Frage nennt Tonnamen, also ist jede Oktave dieses Namens die richtige Antwort —
    // dieselbe Lizenz, mit der eine gerechnete Bruchfrage jede Schreibweise annimmt (#162).
    expect(checkStaffLine(task, 'E5q G5q B5h')?.verdict).toBe('correct');
  });

  it('zählt das Präfix, das hält, und nennt genau eine Stelle', () => {
    const wrongPitch = checkStaffLine(task, 'E4q A4q B4h');
    expect(wrongPitch).toEqual({
      held: 1,
      total: 3,
      verdict: 'partly',
      fault: { at: 'pitch', bar: 1, index: 2 },
    });
    const wrongValue = checkStaffLine(task, 'E4q G4q B4q');
    // Eine Viertel statt einer Halben: der Takt geht dann nicht mehr auf, und das ist der
    // Befund, den die Aufgabe eigentlich prüft.
    expect(wrongValue?.fault).toEqual({ at: 'bar', bar: 1, over: false });
    expect(wrongValue?.held).toBe(2);
    const restHere = checkStaffLine(task, 'E4q Rq B4h');
    expect(restHere?.fault).toEqual({ at: 'note_here', bar: 1, index: 2 });
  });

  it('sagt, wenn ein Takt zu voll oder zu leer ist', () => {
    const twoBars: StaffTask = {
      task: 'write_line',
      clef: 'treble',
      time: '2/4',
      bars: [
        [{ el: 'note', pitch: p('E', 4), value: 'half', dotted: false }],
        [{ el: 'note', pitch: p('G', 4), value: 'half', dotted: false }],
      ],
    };
    expect(checkStaffLine(twoBars, 'E4h | G4h')?.verdict).toBe('correct');
    // Ein Zeichen zu viel: das wird zuerst gesagt, weil danach alles verschoben ist.
    const crammed = checkStaffLine(twoBars, 'E4h G4h | E4h');
    expect(crammed?.fault).toEqual({ at: 'count', given: 3, wanted: 2 });
    // Richtig viele Zeichen, aber der erste Takt ist voller als ein Zweivierteltakt.
    const over = checkStaffLine(twoBars, 'E4w | G4h');
    expect(over?.fault).toEqual({ at: 'bar', bar: 1, over: true });
    const under = checkStaffLine(twoBars, 'E4q | G4h');
    expect(under?.fault).toEqual({ at: 'bar', bar: 1, over: false });
  });

  it('urteilt über nichts, was keine Notenzeile ist', () => {
    // Null heißt „nichts zu vergleichen", nicht „falsch": der Aufrufer prüft dann gegen den
    // Schlüssel in Worten, statt ein Urteil über Noten zu fällen, von denen keine da waren.
    expect(checkStaffLine(task, 'kein Notentext')).toBeNull();
    expect(checkStaffLine(task, '')).toBeNull();
    // Und keine Schreibaufgabe hat hier nichts zu prüfen.
    expect(
      checkStaffLine({ task: 'name_note', clef: 'treble', pitch: p('G', 4) }, 'E4q'),
    ).toBeNull();
  });

  it('zeigt die Stelle erst ab dem zweiten Versuch', () => {
    const check = checkStaffLine(task, 'E4q A4q B4h');
    expect(check).not.toBeNull();
    if (!check) return;
    const first = staffLineReply('de', check, 0);
    const second = staffLineReply('de', check, 1);
    // Ein einzelnes Zeichen bekommt seinen eigenen Satz, statt „die ersten 1" zu sagen.
    expect(first).toBe('Das erste von 3 Zeichen stimmt.');
    expect(second).toContain('Takt 1');
    expect(second.length).toBeGreaterThan(first.length);
  });

  it('schreibt ihre Zeile in Worte, damit das Gespräch lesbar bleibt', () => {
    expect(writtenStaffLine('de', 'E4q A4q B4h')).toBe(
      'E als Viertelnote, A als Viertelnote, H als halbe Note',
    );
    expect(writtenStaffLine('de', 'Rq.')).toBe('punktierte Viertelpause');
    expect(writtenStaffLine('de', 'kein Notentext')).toBeNull();
  });
});

// Notennamen auf der Zeile (issue #312, Owner 03.10.: „dass die für gewisse Übungen auch
// beschriftet werden müssen"). Die Zusage ist eine in BEIDE Richtungen: der gefragte Name steht nie
// da — und wo nichts gefragt ist, wird die Beschriftung auch nicht verschluckt.
describe('Notennamen auf der Zeile', () => {
  /** Jeder Ton, den ein Schlüssel zeichnet — die ganze Menge, nicht ein Beispiel. */
  const everyPitch = (clef: Clef): Pitch[] =>
    [2, 3, 4, 5, 6].flatMap((octave) =>
      (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const)
        .map((name) => p(name, octave))
        .filter((pitch) => onStaff(pitch, clef)),
    );

  it('beschriftet die gefragte Note nie, in keinem Schlüssel und bei keinem Ton', () => {
    for (const clef of ['treble', 'bass'] as const) {
      for (const pitch of everyPitch(clef)) {
        const task: StaffTask = { task: 'name_note', clef, pitch };
        const item = staffItem(task, 'de');
        const figure = item?.figure;
        expect(figure?.type, `${pitch.name}${pitch.octave}`).toBe('staff');
        expect(figure?.type === 'staff' ? figure.labels : null).toEqual([]);
        // Und die Regel selbst, unabhängig davon, was die Aufgabe wollte: auch wer die Note
        // ausdrücklich beschriftet haben will, bekommt sie nicht beschriftet.
        expect(visibleLabels(task, quarters(pitch), [0])).toEqual([]);
      }
    }
  });

  it('verschweigt auch eine zweite Note desselben Namens, die die Antwort ebenso verriete', () => {
    const task: StaffTask = { task: 'name_note', clef: 'treble', pitch: p('E', 4) };
    expect(visibleLabels(task, quarters(p('E', 4), p('G', 4), p('E', 5)), [0, 1, 2])).toEqual([1]);
  });

  it('beschriftet die gegebenen Noten, wo nicht ihr Name gefragt ist', () => {
    // Die andere Richtung: ein Intervall und ein Rhythmus tragen ihre Namen — die Regel nimmt
    // nichts weg, was nicht die Antwort ist.
    const interval: StaffTask = {
      task: 'interval',
      clef: 'treble',
      lower: p('E', 4),
      upper: p('G', 4),
    };
    const fifth = staffItem(interval, 'de')?.figure;
    expect(fifth?.type === 'staff' ? fifth.labels : null).toEqual([0, 1]);
    expect(visibleLabels(interval, quarters(p('E', 4), p('G', 4)), [0, 1])).toEqual([0, 1]);

    const rhythm: StaffTask = {
      task: 'time_signature',
      clef: 'bass',
      time: '3/4',
      bars: [
        [
          { el: 'note', pitch: p('G', 2), value: 'quarter', dotted: false },
          { el: 'rest', value: 'quarter', dotted: false },
          { el: 'note', pitch: p('D', 3), value: 'quarter', dotted: false },
        ],
      ],
    };
    // Die Pause hat keinen Namen und zählt nicht mit: Noten 0 und 1 sind G und D.
    expect(staffLabels(rhythm, rhythm.bars)).toEqual([0, 1]);
  });

  it('lässt den Platzhalter eines Notenwerts unbeschriftet', () => {
    const value: StaffTask = {
      task: 'name_value',
      clef: 'treble',
      value: 'half',
      dotted: false,
      rest: false,
    };
    const figure = staffItem(value, 'de')?.figure;
    expect(figure?.type === 'staff' ? figure.labels : null).toEqual([]);
  });

  it('nimmt nur Nummern, die eine Note der Zeile sind, und keine doppelt', () => {
    const interval: StaffTask = {
      task: 'interval',
      clef: 'treble',
      lower: p('C', 5),
      upper: p('G', 5),
    };
    const bars = quarters(p('C', 5), p('G', 5));
    expect(visibleLabels(interval, bars, [1, 1, 0, 2, -1, 0.5])).toEqual([0, 1]);
  });
});

describe('die feste Antwort auf eine falsche Notenantwort', () => {
  it('nennt für jede Aufgabe eine Stelle und verrät nie die Lösung', () => {
    const every: StaffTask[] = [
      { task: 'name_note', clef: 'treble', pitch: p('G', 4) },
      { task: 'name_value', clef: 'treble', value: 'quarter', dotted: false, rest: false },
      { task: 'interval', clef: 'treble', lower: p('C', 5), upper: p('E', 5) },
      {
        task: 'time_signature',
        clef: 'treble',
        time: '3/4',
        bars: quarters(p('E', 4), p('G', 4), p('E', 4)),
      },
      {
        task: 'write_line',
        clef: 'treble',
        time: '4/4',
        bars: quarters(p('E', 4), p('G', 4), p('B', 4), p('G', 4)),
      },
    ];
    for (const task of every) {
      const item = staffItem(task, 'de');
      const line = staffAgain('de', task);
      expect(line.length, task.task).toBeGreaterThan(10);
      expect(item && mentionsSolution(line, item.answer, item.prompt), task.task).toBe(false);
    }
  });
});
