// Circuits and logic nets next to a question (issue #261): every shape draws without crashing,
// a lamp looks the same whether it lights or not, and what a screen reader hears is the figure in
// words — every part with its name, value and state, every gate with what it takes, never the key.
//
// Layout, fit and keys are packages/shared-math/src/__tests__/circuit.test.ts and logic.test.ts;
// the drawing at 360 and 390 px, light and dark, is tests/web/circuits.spec.ts.

import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import {
  describeSwitching,
  SwitchingBody,
  type CircuitFig,
  type LogicFig,
} from '../CircuitFigures.js';

const lamp = { k: 'lamp', r: 0, o: false } as const;
const res = (r: number) => ({ k: 'resistor', r, o: false }) as const;
const sw = (o: boolean) => ({ k: 'switch', r: 0, o }) as const;

const parallel: CircuitFig = {
  type: 'circuit',
  u: 4.5,
  b: [
    [
      [lamp, sw(false)],
      [lamp, sw(true)],
    ],
  ],
  m: 'none',
  mt: '',
  ask: 'lit',
  at: 'L2',
};

const metered: CircuitFig = {
  type: 'circuit',
  u: 12,
  b: [[[res(100)]], [[res(200)], [res(200)]]],
  m: 'voltmeter',
  mt: 'R2',
  ask: 'voltage',
  at: '',
};

const net: LogicFig = {
  type: 'logic',
  g: [
    { o: 'and', a: 'A', b: 'B' },
    { o: 'not', a: 'C', b: '' },
    { o: 'or', a: 'G1', b: 'G2' },
  ],
  ask: 'out',
  v: [1, 1, 1],
};

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

describe('SwitchingBody', () => {
  it.each([
    ['parallel lamps', parallel],
    ['a voltmeter', metered],
    ['a logic net', net],
  ] as const)('draws %s', (_, figure) => {
    const { container } = renderInApp(<SwitchingBody figure={figure} width={266} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it.each([
    ['parallel lamps', parallel],
    ['a logic net', net],
  ] as const)('shrinks %s as a whole at FigureView’s scale (#419)', (_, figure) => {
    // FigureView hands over a width already shrunk by its scale. Laid out at that narrower width
    // the drawing did not fit at all and vanished, and the card's room went wrong around it.
    const full = renderInApp(<SwitchingBody figure={figure} width={266} />);
    const half = renderInApp(<SwitchingBody figure={figure} width={133} scale={0.5} />);
    const size = (c: HTMLElement) => {
      const svg = c.querySelector('svg');
      return { w: Number(svg?.getAttribute('width')), h: Number(svg?.getAttribute('height')) };
    };
    expect(size(half.container).w).toBeCloseTo(size(full.container).w / 2, -0.5);
    expect(size(half.container).h).toBeCloseTo(size(full.container).h / 2, -0.5);
  });

  it('names every part and writes values with the decimal mark', () => {
    const { container } = renderInApp(<SwitchingBody figure={parallel} width={266} />);
    const text = container.textContent ?? '';
    for (const name of ['L1', 'L2', 'S1', 'S2']) expect(text).toContain(name);
    expect(text).toContain('4,5 V');
  });

  it('draws a lamp the same whether it lights or not', () => {
    const lit = renderInApp(<SwitchingBody figure={{ ...parallel, at: 'L1' }} width={266} />);
    const dark = renderInApp(<SwitchingBody figure={parallel} width={266} />);
    expect(lit.container.innerHTML).toBe(dark.container.innerHTML);
  });

  it('draws gates with their DIN symbols and the output Q', () => {
    const { container } = renderInApp(<SwitchingBody figure={net} width={266} />);
    const text = container.textContent ?? '';
    for (const s of ['&', '≥1', '1', 'A', 'B', 'C', 'Q', 'G3']) expect(text).toContain(s);
  });
});

describe('describeSwitching', () => {
  it('says the battery, each branch, a parallel branch and a switch’s state', () => {
    const said = describeSwitching(parallel, t);
    expect(said).toContain('figure.circuit {"u":"4,5 V"}');
    expect(said).toContain('figure.circuit_lamp {"name":"L1"}, figure.circuit_switch_closed');
    expect(said).toContain('figure.circuit_parallel figure.circuit_lamp {"name":"L2"}');
    expect(said).toContain('figure.circuit_switch_open {"name":"S2"}');
    // Never whether a lamp lights.
    expect(said).not.toMatch(/lit|leuchtet/);
  });

  it('says values and the meter, never its reading', () => {
    const said = describeSwitching(metered, t);
    expect(said).toContain('figure.circuit_resistor {"name":"R2"} 200 Ω');
    expect(said).toContain('figure.circuit_voltmeter {"name":"R2"}');
    expect(said).not.toContain(' 8');
  });

  it('says every gate with its inputs, and which one is Q', () => {
    const said = describeSwitching(net, t);
    expect(said).toContain('figure.logic {"inputs":"A, B, C"}');
    expect(said).toContain(
      'figure.logic_gate {"name":"G1","op":"figure.logic_and","a":"A","b":"B"}',
    );
    expect(said).toContain(
      'figure.logic_gate_one {"name":"G2","op":"figure.logic_not","a":"C","b":""}',
    );
    expect(said).toContain('figure.logic_out {"name":"G3"}');
  });
});
