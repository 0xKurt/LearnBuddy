// The figure library (issues #250, #252, #261), Regel 0 in both directions: every key is
// computed from code's data or code's net — checked here against values written down by hand,
// independently of the code that computes them — and every choice that does not hold together
// gives no question. Every ask is reached through `libraryTaskItems`, the function generation uses.

import {
  complementOf,
  ELEMENTS,
  mixOf,
  SCHEMATIC_IDS,
  SCHEMATICS,
  StructuredTask,
  WHEEL_IDS,
  type FigureTapTask,
  type TapValue,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { libraryTerm, MESSAGES } from '../../../i18n/index.js';
import {
  circuitProblem,
  connectionOf,
  decimalOf,
  flow,
  litLamps,
  truthTable,
  values,
} from '../circuit.js';
import { checkFigureTap, figureTapReply } from '../figureTap.js';
import type { StoredItem } from '../items.js';
import {
  circuitFrom,
  FigureTaskDraft,
  labelProblem,
  libraryItems,
  libraryTaskItems,
  neutronsOf,
} from '../library.js';
import { checkStructured, viewOf } from '../structured.js';

const LOCALES = ['de', 'en', 'fr', 'es', 'it'] as const;

function items(raw: unknown, locale = 'de'): StoredItem[] {
  return libraryTaskItems(FigureTaskDraft.parse(raw), locale);
}

function one(raw: unknown, locale = 'de'): StoredItem {
  const out = items(raw, locale);
  expect(out).toHaveLength(1);
  return out[0]!;
}

function tapTask(it: StoredItem): FigureTapTask {
  expect(it.kind).toBe('figure_tap');
  const task = StructuredTask.parse(it.task);
  if (task.type !== 'figure_tap') throw new Error('not a tap task');
  return task;
}

function tap(task: FigureTapTask, value: TapValue) {
  return checkFigureTap(task, { type: 'figure_tap', value });
}

// ─────────────── the periodic table (#250) ───────────────

// Written down by hand from a school table: Z, main group, period, valence electrons, neutrons
// of the most common isotope (from the rounded mass), class. Not derived from ELEMENTS.
const MAIN_TO_CA: ReadonlyArray<
  [string, number, number, number, number, number | null, 'metal' | 'metalloid' | 'nonmetal']
> = [
  ['H', 1, 1, 1, 1, 0, 'nonmetal'],
  ['He', 2, 8, 1, 2, 2, 'nonmetal'],
  ['Li', 3, 1, 2, 1, 4, 'metal'],
  ['Be', 4, 2, 2, 2, 5, 'metal'],
  ['B', 5, 3, 2, 3, 6, 'metalloid'],
  ['C', 6, 4, 2, 4, 6, 'nonmetal'],
  ['N', 7, 5, 2, 5, 7, 'nonmetal'],
  ['O', 8, 6, 2, 6, 8, 'nonmetal'],
  ['F', 9, 7, 2, 7, 10, 'nonmetal'],
  ['Ne', 10, 8, 2, 8, 10, 'nonmetal'],
  ['Na', 11, 1, 3, 1, 12, 'metal'],
  ['Mg', 12, 2, 3, 2, 12, 'metal'],
  ['Al', 13, 3, 3, 3, 14, 'metal'],
  ['Si', 14, 4, 3, 4, 14, 'metalloid'],
  ['P', 15, 5, 3, 5, 16, 'nonmetal'],
  ['S', 16, 6, 3, 6, 16, 'nonmetal'],
  // Chlorine: 35.45 u — the rounding is a coin toss (Cl-35 and Cl-37), so no neutron question.
  ['Cl', 17, 7, 3, 7, null, 'nonmetal'],
  ['Ar', 18, 8, 3, 8, 22, 'nonmetal'],
  ['K', 19, 1, 4, 1, 20, 'metal'],
  ['Ca', 20, 2, 4, 2, 20, 'metal'],
];

describe('periodic table (#250): every key computed from the table', () => {
  it.each(MAIN_TO_CA)('%s', (sym, z, group, period, valence, neutrons, cls) => {
    const el = (ask: string) => ({ task: 'element', ask, element: sym });
    expect(one(el('protons')).answer).toBe(String(z));
    expect(one(el('electrons')).answer).toBe(String(z));
    expect(one(el('valence')).answer).toBe(String(valence));
    expect(one(el('period')).answer).toBe(String(period));
    const g = one(el('group'));
    expect(g.answer).toBe(String(group));
    expect(g.accepted_answers).toEqual([
      ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][group - 1],
    ]);
    if (neutrons === null) expect(items(el('neutrons'))).toEqual([]);
    else expect(one(el('neutrons')).answer).toBe(String(neutrons));
    const c = one(el('class'));
    expect(c.answer).toBe(
      { metal: 'Metall', metalloid: 'Halbmetall', nonmetal: 'Nichtmetall' }[cls],
    );
    expect(c.choices?.[c.correct_choice!]).toBe(c.answer);
    expect(c.choices).toHaveLength(3);
  });

  it('marks the element in a main-group table and the question names it', () => {
    const it = one({ task: 'element', ask: 'valence', element: 's' });
    expect(it.prompt).toBe('Wie viele Valenzelektronen hat ein Atom Schwefel?');
    expect(it.figure).toEqual({ type: 'periodic', table: 'main', mark: 's' });
    expect(it.unit).toBeNull();
    // Help never states the number.
    expect(it.hints.join(' ')).not.toMatch(/\b6\b/);
  });

  it('a d-block element is drawn in the full table; no valence or main group for it', () => {
    expect(one({ task: 'element', ask: 'protons', element: 'Fe' }).figure).toEqual({
      type: 'periodic',
      table: 'full',
      mark: 'fe',
    });
    expect(items({ task: 'element', ask: 'valence', element: 'Fe' })).toEqual([]);
    expect(items({ task: 'element', ask: 'group', element: 'Fe' })).toEqual([]);
  });

  it('an unknown symbol, an element without a stable isotope or an unclear class gives nothing', () => {
    expect(items({ task: 'element', ask: 'protons', element: 'Xx' })).toEqual([]);
    expect(items({ task: 'element', ask: 'neutrons', element: 'Tc' })).toEqual([]);
    expect(items({ task: 'element', ask: 'neutrons', element: 'Rn' })).toEqual([]);
    expect(items({ task: 'element', ask: 'class', element: 'At' })).toEqual([]);
  });

  it('neutrons are never asked where the rounding decides the answer', () => {
    for (const e of ELEMENTS) {
      const n = neutronsOf(e);
      if (n === null) continue;
      const frac = e.mass - Math.floor(e.mass);
      expect(Math.abs(frac - 0.5)).toBeGreaterThanOrEqual(0.1);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });

  it('electronegativity: the higher one is the key, a close pair is no question', () => {
    const it = one({ task: 'element', ask: 'more_en', element: 'Na', other: 'Cl' });
    expect(it.answer).toBe('Chlor');
    expect(it.choices).toHaveLength(2);
    expect(items({ task: 'element', ask: 'more_en', element: 'C', other: 'S' })).toEqual([]);
    expect(items({ task: 'element', ask: 'more_en', element: 'Ne', other: 'F' })).toEqual([]);
    expect(items({ task: 'element', ask: 'more_en', element: 'O', other: null })).toEqual([]);
  });

  it('tapping: the element by name and by place; the reply says what is already right', () => {
    const find = one({ task: 'element', ask: 'find', element: 'Mg' });
    expect(find.prompt).toBe('Tippe im Periodensystem auf das Element Magnesium.');
    const task = tapTask(find);
    expect(task.figure).toEqual({ kind: 'periodic', table: 'main' });
    expect(tap(task, { kind: 'periodic', id: 'mg' })?.correct).toBe(true);
    const sameGroup = tap(task, { kind: 'periodic', id: 'ca' })!;
    expect(sameGroup.miss).toBe('group_right');
    expect(figureTapReply('de', sameGroup, 0)).toBe(
      'Das ist Ca (Calcium) — die Gruppe stimmt schon. Schau in eine andere Periode.',
    );
    expect(tap(task, { kind: 'periodic', id: 'al' })?.miss).toBe('period_right');
    expect(tap(task, { kind: 'periodic', id: 'o' })?.miss).toBe('element');
    // Not in the main-group table: no tap on this figure at all.
    expect(tap(task, { kind: 'periodic', id: 'fe' })).toBeNull();
    expect(tap(task, { kind: 'schematic', id: 'nucleus' })).toBeNull();

    const locate = one({ task: 'element', ask: 'locate', element: 'P' });
    expect(locate.prompt).toBe('Tippe auf das Element in der 3. Periode, 5. Hauptgruppe.');
    expect(tapTask(locate).key).toEqual({ kind: 'periodic', id: 'p' });
    const full = one({ task: 'element', ask: 'locate', element: 'Cu' });
    expect(full.prompt).toBe('Tippe auf das Element in der 4. Periode, Gruppe 11.');
    // The view never carries the key.
    expect(JSON.stringify(viewOf(tapTask(full)))).not.toContain('cu');
  });

  it('every element of the table has its name in all five languages', () => {
    for (const e of ELEMENTS)
      for (const l of LOCALES)
        expect(libraryTerm(l, `elements.${e.sym.toLowerCase()}`), `${l} ${e.sym}`).toBeTruthy();
  });
});

// ─────────────── schematic drawings (#252) ───────────────

describe('schematic drawings (#252)', () => {
  it('every part of every drawing has a name and a tap form in five languages', () => {
    for (const d of SCHEMATIC_IDS) {
      for (const l of LOCALES) {
        expect(libraryTerm(l, `drawings.${d}`), `${l} ${d}`).toBeTruthy();
        for (const p of Object.keys(SCHEMATICS[d].parts)) {
          expect(libraryTerm(l, `parts.${d}.${p}`), `${l} ${d}.${p}`).toBeTruthy();
          expect(libraryTerm(l, `parts_tap.${d}.${p}`), `${l} ${d}.${p}`).toBeTruthy();
        }
      }
      // And no more words than parts: a word for a part that is not drawn is a dead key.
      expect(
        Object.keys(MESSAGES.de.library.parts[d as keyof typeof MESSAGES.de.library.parts]).sort(),
      ).toEqual(Object.keys(SCHEMATICS[d].parts).sort());
    }
  });

  it('every drawing fits its margins with all its parts at once', () => {
    for (const d of SCHEMATIC_IDS)
      expect(labelProblem(d, Object.keys(SCHEMATICS[d].parts)), d).toBeNull();
  });

  it('"Zelle beschriften": five parts give five tap questions, numbered in pin order', () => {
    const out = items({
      task: 'label',
      drawing: 'plant_cell',
      ask: 'tap',
      parts: ['vacuole', 'nucleus', 'cell_wall', 'chloroplast', 'membrane'],
    });
    expect(out).toHaveLength(5);
    expect(out.map((i) => i.prompt)).toEqual([
      'Tippe auf die Zellwand.',
      'Tippe auf den Zellkern.',
      'Tippe auf die Zellmembran.',
      'Tippe auf die Vakuole.',
      'Tippe auf einen Chloroplasten.',
    ]);
    const task = tapTask(out[1]!);
    // Left side top to bottom, then the right side.
    expect(task.figure).toEqual({
      kind: 'schematic',
      drawing: 'plant_cell',
      parts: ['cell_wall', 'nucleus', 'membrane', 'vacuole', 'chloroplast'],
    });
    expect(out[1]!.answer).toBe('Zellkern');
    expect(tap(task, { kind: 'schematic', id: 'nucleus' })?.correct).toBe(true);
    const wrong = tap(task, { kind: 'schematic', id: 'vacuole' })!;
    expect(figureTapReply('de', wrong, 0)).toBe('Das ist: Vakuole. Gesucht ist ein anderer Teil.');
    // A part of the drawing without a pin is no tap on this figure.
    expect(tap(task, { kind: 'schematic', id: 'cytoplasm' })).toBeNull();
  });

  it('naming: options are names from the same drawing, the key is the library name', () => {
    const out = items({
      task: 'label',
      drawing: 'eye',
      ask: 'name',
      parts: ['lens', 'retina', 'iris', 'cornea'],
    });
    expect(out).toHaveLength(4);
    const first = out[0]!;
    expect(first.prompt).toBe('Wie heißt Teil 1?');
    expect(first.figure).toEqual({
      type: 'schematic',
      drawing: 'eye',
      parts: ['iris', 'cornea', 'retina', 'lens'],
      focus: 'iris',
    });
    expect(first.answer).toBe('Regenbogenhaut');
    expect([...(first.choices ?? [])].sort()).toEqual([
      'Hornhaut',
      'Linse',
      'Netzhaut',
      'Regenbogenhaut',
    ]);
    expect(first.choices?.[first.correct_choice!]).toBe('Regenbogenhaut');
  });

  it('matching numbers and names is one match task', () => {
    const it = one({
      task: 'label',
      drawing: 'heart',
      ask: 'match',
      parts: ['aorta', 'septum', 'left_ventr'],
    });
    expect(it.kind).toBe('match');
    const task = StructuredTask.parse(it.task);
    if (task.type !== 'match') throw new Error('match');
    const view = viewOf(task);
    if (view.type !== 'match') throw new Error('view');
    expect(view.left.map((l) => l.text).sort()).toEqual(['1', '2', '3']);
    const right = (name: string) => view.right.find((r) => r.text === name)!.id;
    const left = (n: string) => view.left.find((l) => l.text === n)!.id;
    // Pin order: left side (none here), then the right side top to bottom: aorta, septum, left ventricle.
    const check = checkStructured(task, {
      type: 'match',
      links: [
        { left: left('1'), right: right('Aorta') },
        { left: left('2'), right: right('Herzscheidewand') },
        { left: left('3'), right: right('linke Herzkammer') },
      ],
    });
    expect(check?.correct).toBe(true);
  });

  it('Regel 0: unknown, repeated, too few or crowded parts give nothing', () => {
    const label = (parts: string[], ask = 'tap') =>
      items({ task: 'label', drawing: 'plant_cell', ask, parts });
    expect(label(['nucleus', 'heart'])).toEqual([]);
    expect(label(['nucleus', 'nucleus'])).toEqual([]);
    expect(label(['nucleus'])).toEqual([]);
    // Five on the left side of the plant cell would not fit at 44 pt.
    expect(labelProblem('flower', ['petal', 'anther', 'filament', 'sepal'])).toBeNull();
    expect(
      labelProblem('plant_cell', ['cell_wall', 'membrane', 'nucleus', 'cytoplasm']),
    ).toBeNull();
    // A match needs three or four.
    expect(label(['nucleus', 'vacuole'], 'match')).toEqual([]);
    expect(label(['nucleus', 'vacuole', 'cell_wall', 'membrane', 'chloroplast'], 'match')).toEqual(
      [],
    );
  });

  it('accepts a synonym spelled by the model in any case', () => {
    expect(
      items({ task: 'label', drawing: 'tooth', ask: 'tap', parts: ['Pulp', ' ROOT '] }),
    ).toHaveLength(2);
  });
});

// ─────────────── circuits (#261) ───────────────

const L = (ohm: number | null = null, asked = false) => ({
  part: 'lamp' as const,
  ohm,
  open: false,
  asked,
});
const R = (ohm: number, asked = false) => ({ part: 'resistor' as const, ohm, open: false, asked });
const S = (open: boolean) => ({ part: 'switch' as const, ohm: null, open, asked: false });

function net(
  voltage: number | null,
  blocks: Array<Array<Array<ReturnType<typeof L | typeof R | typeof S>>>>,
) {
  const built = circuitFrom(
    voltage,
    blocks.map((b) => ({ branches: b })),
  );
  if (!built) throw new Error('no circuit');
  return built.circuit;
}

describe('circuits (#261): computed from the net', () => {
  it('series with an open switch: nothing lights', () => {
    const c = net(6, [[[L()]], [[S(true)]], [[L()]]]);
    expect(flow(c).state).toBe('open');
    expect(litLamps(c)).toEqual([]);
  });

  it('parallel with an open switch in one branch: only the other lamp lights', () => {
    const c = net(6, [[[L(), S(true)], [L()]]]);
    expect(litLamps(c)).toEqual(['l2']);
    const dark = one({
      task: 'circuit',
      ask: 'dark_lamp',
      voltage: 6,
      blocks: [{ branches: [[L(), S(true)], [L()]] }],
    });
    expect(dark.prompt).toBe('Eine Lampe leuchtet nicht. Tippe auf sie.');
    const task = tapTask(dark);
    expect(tap(task, { kind: 'circuit', id: 'l1' })?.correct).toBe(true);
    expect(tap(task, { kind: 'circuit', id: 'l2' })?.miss).toBe('lamp');
    // A switch is no lamp to tap.
    expect(tap(task, { kind: 'circuit', id: 's1' })).toBeNull();
  });

  it('a lamp bridged by a closed switch stays dark', () => {
    const c = net(6, [[[L()]], [[L()], [S(false)]]]);
    expect(litLamps(c)).toEqual(['l1']);
    expect(
      one({
        task: 'circuit',
        ask: 'lit_count',
        voltage: null,
        blocks: [{ branches: [[L()]] }, { branches: [[L()], [S(false)]] }],
      }).answer,
    ).toBe('1');
  });

  it('a short circuit of the battery is no circuit', () => {
    expect(circuitFrom(6, [{ branches: [[S(false)]] }])).toBeNull();
    expect(circuitFrom(6, [{ branches: [[L()], [S(false)]] }])).toBeNull();
  });

  it('equivalent resistance: series adds, parallel by conductance', () => {
    expect(decimalOf(values(net(12, [[[R(10), R(20)]]]))!.resistance)).toBe('30');
    expect(decimalOf(values(net(12, [[[R(10)], [R(40)]]]))!.resistance)).toBe('8');
    // 6 Ω in series with (6 Ω ∥ 12 Ω = 4 Ω) = 10 Ω.
    expect(decimalOf(values(net(12, [[[R(6)]], [[R(6)], [R(12)]]]))!.resistance)).toBe('10');
    const it = one({
      task: 'circuit',
      ask: 'resistance',
      voltage: null,
      blocks: [{ branches: [[R(10)], [R(40)]] }],
    });
    expect(it).toMatchObject({ kind: 'numeric', answer: '8', unit: 'Ω' });
  });

  it('ammeter and voltmeter: current through and voltage across the asked part', () => {
    // 12 V, R1 = 6 Ω in series with R2 = 6 Ω ∥ R3 = 12 Ω: I = 1.2 A, U(R1) = 7.2 V,
    // U(parallel) = 4.8 V, I(R2) = 0.8 A, I(R3) = 0.4 A.
    const blocks = (a: number, b: number) => [
      { branches: [[R(6, a === 1)]] },
      { branches: [[R(6, a === 2)], [R(12, a === 3 || b === 3)]] },
    ];
    expect(
      one({ task: 'circuit', ask: 'current', voltage: 12, blocks: blocks(2, 0) }),
    ).toMatchObject({
      answer: '0.8',
      unit: 'A',
      figure: expect.objectContaining({ meter: { kind: 'ammeter', at: 'r2' } }),
    });
    expect(one({ task: 'circuit', ask: 'current', voltage: 12, blocks: blocks(3, 0) }).answer).toBe(
      '0.4',
    );
    expect(
      one({ task: 'circuit', ask: 'voltage', voltage: 12, blocks: blocks(1, 0) }),
    ).toMatchObject({
      answer: '7.2',
      unit: 'V',
    });
    expect(one({ task: 'circuit', ask: 'voltage', voltage: 12, blocks: blocks(2, 0) }).answer).toBe(
      '4.8',
    );
  });

  it('Regel 0: a result she cannot type as a short decimal, a missing value or no marked part gives nothing', () => {
    // 10 V over 3 Ω: 3.333… A.
    expect(
      items({
        task: 'circuit',
        ask: 'current',
        voltage: 10,
        blocks: [{ branches: [[R(3, true)]] }],
      }),
    ).toEqual([]);
    expect(
      items({
        task: 'circuit',
        ask: 'current',
        voltage: null,
        blocks: [{ branches: [[R(3, true)]] }],
      }),
    ).toEqual([]);
    expect(
      items({ task: 'circuit', ask: 'current', voltage: 6, blocks: [{ branches: [[R(3)]] }] }),
    ).toEqual([]);
    expect(
      items({
        task: 'circuit',
        ask: 'resistance',
        voltage: null,
        blocks: [{ branches: [[L(), L()]] }],
      }),
    ).toEqual([]);
    // Two lamps dark: "the one lamp that does not light" would be two.
    expect(
      items({
        task: 'circuit',
        ask: 'dark_lamp',
        voltage: 6,
        blocks: [{ branches: [[L(), L(), S(true)]] }],
      }),
    ).toEqual([]);
  });

  it('series, parallel or mixed is read off the net', () => {
    expect(connectionOf(net(6, [[[L(), L(), S(false)]]]))).toBe('series');
    expect(connectionOf(net(6, [[[L()]], [[S(false)]], [[L()]]]))).toBe('series');
    expect(connectionOf(net(6, [[[L()], [L()], [L()]]]))).toBe('parallel');
    expect(connectionOf(net(6, [[[S(false)]], [[L()], [L(), S(true)]]]))).toBe('parallel');
    expect(connectionOf(net(6, [[[L()]], [[L()], [L()]]]))).toBe('mixed');
    const it = one({
      task: 'circuit',
      ask: 'connection',
      voltage: 6,
      blocks: [{ branches: [[L()], [L()]] }],
    });
    expect(it.answer).toBe('Parallelschaltung');
  });

  it('too wide or too many parts is not drawn', () => {
    expect(
      circuitFrom(6, [{ branches: [[L(), L(), L()]] }, { branches: [[L(), L()]] }]),
    ).toBeNull();
    const c = net(6, [[[L()]]]);
    expect(
      circuitProblem({
        ...c,
        blocks: [
          {
            branches: [
              [{ id: 's1', part: 'switch', ohm: 5, open: false }, ...c.blocks[0]!.branches[0]!],
            ],
          },
        ],
      }),
    ).toBe('circuit_parts');
  });

  it('decimals: exact, at most three places', () => {
    expect(decimalOf({ n: 3n, d: 8n })).toBe('0.375');
    expect(decimalOf({ n: 1n, d: 16n })).toBeNull();
    expect(decimalOf({ n: -5n, d: 2n })).toBe('-2.5');
  });
});

// ─────────────── logic gates (#261) ───────────────

describe('logic gates (#261): truth tables computed', () => {
  const q = (gate: string, then: string | null = null) =>
    truthTable({ gate: gate as 'and', then: then as 'and' | null })
      .map((r) => (r.q ? 1 : 0))
      .join('');

  it('one gate', () => {
    expect(q('and')).toBe('0001');
    expect(q('or')).toBe('0111');
    expect(q('xor')).toBe('0110');
    expect(q('nand')).toBe('1110');
    expect(q('nor')).toBe('1000');
    expect(q('not')).toBe('10');
  });

  it('two gates: (A AND B) OR C, NOT A AND B', () => {
    expect(q('and', 'or')).toBe('01010111');
    expect(q('not', 'and')).toBe('0100');
  });

  it('becomes a table to fill in, the gaps keyed by code, with the gates drawn', () => {
    const it = one({ task: 'logic', gate: 'xor', then: null });
    expect(it.kind).toBe('table_fill');
    expect(it.figure).toEqual({ type: 'logic', gate: 'xor', then: null });
    const task = StructuredTask.parse(it.task);
    if (task.type !== 'table_fill') throw new Error('table');
    // Laid across: the A row is the heading, then B, then Q to fill in.
    expect(task.header).toEqual(['A', '0', '0', '1', '1']);
    expect(task.rows.map((r) => ('text' in r[0]! ? r[0].text : ''))).toEqual(['B', 'Q']);
    const gaps = task.rows.flatMap((r) => r.filter((c) => 'id' in c));
    expect(gaps.map((g) => ('key' in g ? g.key : ''))).toEqual(['0', '1', '1', '0']);
    const two = StructuredTask.parse(one({ task: 'logic', gate: 'not', then: 'and' }).task);
    if (two.type !== 'table_fill') throw new Error('table');
    expect(two.header).toEqual(['A', '0', '0', '1', '1']);
    expect(two.rows.map((r) => ('text' in r[0]! ? r[0].text : ''))).toEqual(['B', 'X', 'Q']);
    // Three inputs would be eight rows: no room on a phone next to the gates.
    expect(items({ task: 'logic', gate: 'and', then: 'or' })).toEqual([]);
  });
});

// ─────────────── the colour wheel (#261) ───────────────

describe("Itten's colour wheel (#261)", () => {
  it('complements are opposite, in pairs', () => {
    expect(complementOf('y')).toBe('v');
    expect(complementOf('r')).toBe('g');
    expect(complementOf('b')).toBe('o');
    expect(complementOf('yo')).toBe('bv');
    for (const c of WHEEL_IDS) expect(complementOf(complementOf(c))).toBe(c);
  });

  it('mixtures: two primaries give a secondary, a primary and its neighbouring secondary a tertiary', () => {
    expect(mixOf('y', 'r')).toBe('o');
    expect(mixOf('r', 'b')).toBe('v');
    expect(mixOf('b', 'y')).toBe('g');
    expect(mixOf('y', 'g')).toBe('yg');
    expect(mixOf('o', 'r')).toBe('ro');
    expect(mixOf('y', 'v')).toBeNull();
    expect(mixOf('o', 'v')).toBeNull();
    expect(mixOf('r', 'r')).toBeNull();
    expect(mixOf('y', 'b')).toBe('g');
  });

  it('tap questions, with the colour named in words in the reply', () => {
    const it = one({ task: 'color', ask: 'complement', color: 'r' });
    expect(it.prompt).toBe('Tippe auf die Komplementärfarbe von Rot.');
    expect(it.answer).toBe('Grün');
    const task = tapTask(it);
    expect(tap(task, { kind: 'color_wheel', id: 'g' })?.correct).toBe(true);
    expect(figureTapReply('de', tap(task, { kind: 'color_wheel', id: 'bg' })!, 0)).toBe(
      'Das ist Blaugrün. Schau noch einmal in den Farbkreis.',
    );
    expect(one({ task: 'color', ask: 'mix', color: 'y', with: 'r' }).answer).toBe('Orange');
    expect(items({ task: 'color', ask: 'mix', color: 'o', with: 'v' })).toEqual([]);
    expect(items({ task: 'color', ask: 'mix', color: 'o', with: null })).toEqual([]);
  });
});

// ─────────────── every ask in every language ───────────────

describe('the set', () => {
  const ALL: unknown[] = [
    ...[
      'find',
      'locate',
      'protons',
      'electrons',
      'neutrons',
      'valence',
      'group',
      'period',
      'class',
    ].map((ask) => ({
      task: 'element',
      ask,
      element: 'O',
    })),
    { task: 'element', ask: 'more_en', element: 'O', other: 'Li' },
    { task: 'label', drawing: 'flower', ask: 'tap', parts: ['petal', 'stigma'] },
    { task: 'label', drawing: 'flower', ask: 'name', parts: ['petal', 'stigma'] },
    { task: 'label', drawing: 'flower', ask: 'match', parts: ['petal', 'stigma', 'ovary'] },
    {
      task: 'circuit',
      ask: 'dark_lamp',
      voltage: 6,
      blocks: [{ branches: [[L(), S(true)], [L()]] }],
    },
    {
      task: 'circuit',
      ask: 'lit_lamp',
      voltage: 6,
      blocks: [{ branches: [[L(), S(true)], [L()]] }],
    },
    { task: 'circuit', ask: 'lit_count', voltage: 6, blocks: [{ branches: [[L()], [L()]] }] },
    { task: 'circuit', ask: 'connection', voltage: 6, blocks: [{ branches: [[L()], [L()]] }] },
    { task: 'circuit', ask: 'resistance', voltage: 6, blocks: [{ branches: [[R(4)], [R(4)]] }] },
    { task: 'circuit', ask: 'current', voltage: 6, blocks: [{ branches: [[R(4, true)], [R(4)]] }] },
    { task: 'circuit', ask: 'voltage', voltage: 6, blocks: [{ branches: [[R(4, true), R(2)]] }] },
    { task: 'logic', gate: 'not', then: 'xor' },
    { task: 'color', ask: 'find', color: 'bg' },
    { task: 'color', ask: 'complement', color: 'o' },
    { task: 'color', ask: 'mix', color: 'b', with: 'g' },
  ];

  it.each(LOCALES)('every ask gives a finished question in %s', (locale) => {
    for (const raw of ALL) {
      const out = items(raw, locale);
      expect(out.length, JSON.stringify(raw)).toBeGreaterThan(0);
      for (const it of out) {
        const words = [
          it.prompt,
          it.answer,
          ...it.hints,
          it.worked_solution ?? '',
          ...(it.choices ?? []),
        ].join(' ');
        // No key left unresolved, no placeholder left over.
        expect(words, JSON.stringify(raw)).not.toMatch(/practice\.library|\{\{|library\./);
        expect(it.prompt.charAt(0)).toBe(it.prompt.charAt(0).toLocaleUpperCase(locale));
      }
    }
  });

  it('caps the questions of a set', () => {
    const many = Array.from({ length: 6 }, () =>
      FigureTaskDraft.parse({
        task: 'label',
        drawing: 'skeleton',
        ask: 'tap',
        parts: ['skull', 'spine', 'femur', 'pelvis'],
      }),
    );
    expect(libraryItems(many, 'de')).toHaveLength(8);
  });
});
