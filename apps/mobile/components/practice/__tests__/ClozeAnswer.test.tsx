// Lückentext (issue #232): Lücken mitten im Text, getippt oder aus der Wortbank angetippt.
// Was hier festgehalten wird:
//
//   · der Text bricht nie direkt vor einem Satzzeichen hinter einer Lücke um;
//   · jede Lücke hat einen Namen („Lücke 2 von 3"), eine gefüllte sagt ihr Wort;
//   · ein Wort der Bank landet in der aktiven Lücke, danach ist die nächste leere aktiv; ein
//     Tipp auf eine gefüllte Lücke leert sie wieder, und das Wort ist zurück in der Bank;
//   · „Prüfen" wartet, bis jede Lücke etwas hat, und schickt `parts` mit `via` — angetippt
//     ist nicht getippt (issue #163).
//
// Was diese Schicht nicht sehen kann: ob fünf Lücken mit offener Tastatur auf 360×740
// passen. Das misst der Walkthrough (tests/web/modes.spec.ts).

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { ClozeAnswer, filledFrom, nextEmpty, unitsOf } from '../ClozeAnswer.js';

const TYPED = {
  type: 'cloze' as const,
  segments: ['Gestern ', ' wir in den Zoo gegangen. Dann hat er ein Eis ', '.'],
  gaps: ['g1', 'g2'],
  bank: null,
};

const BANKED = {
  type: 'cloze' as const,
  segments: ['Die Wurzel nimmt ', ' auf, die Blätter geben ', ' ab, und es entsteht ', '.'],
  gaps: ['g1', 'g2', 'g3'],
  bank: ['Sauerstoff', 'Stickstoff', 'Wasser', 'Zucker'],
};

describe('the text around the gaps', () => {
  it('keeps a gap and the punctuation touching it together, and math whole', () => {
    expect(unitsOf(['Ein ', '. Und $a + b$ ist ', '!'])).toEqual([
      [{ kind: 'text', text: 'Ein' }],
      [
        { kind: 'gap', index: 0 },
        { kind: 'text', text: '.' },
      ],
      [{ kind: 'text', text: 'Und' }],
      [{ kind: 'text', text: '$a + b$' }],
      [{ kind: 'text', text: 'ist' }],
      [
        { kind: 'gap', index: 1 },
        { kind: 'text', text: '!' },
      ],
    ]);
    // A gap glued to a word on both sides stays one unit.
    expect(unitsOf(['(', ')'])).toEqual([
      [
        { kind: 'text', text: '(' },
        { kind: 'gap', index: 0 },
        { kind: 'text', text: ')' },
      ],
    ]);
  });

  it('reads kept words back, and nothing that is not a gap of this task', () => {
    expect(filledFrom('{"g1":"sind","g9":"x","g2":3}', ['g1', 'g2'])).toEqual({ g1: 'sind' });
    expect(filledFrom('kaputt', ['g1'])).toEqual({});
    expect(filledFrom('["g1"]', ['g1'])).toEqual({});
  });

  it('fills the active gap, else the next empty one, else none', () => {
    const ids = ['g1', 'g2', 'g3'];
    expect(nextEmpty(ids, {}, 0)).toBe(0);
    expect(nextEmpty(ids, { g1: 'a' }, 0)).toBe(1);
    expect(nextEmpty(ids, { g3: 'a' }, 2)).toBe(0);
    expect(nextEmpty(ids, { g1: 'a', g2: 'b', g3: 'c' }, 1)).toBeNull();
  });
});

describe('a cloze she types', () => {
  it('names each gap and waits with "Prüfen" until every gap has something', () => {
    const onSubmit = vi.fn();
    renderInApp(<ClozeAnswer view={TYPED} draftKey="c1" disabled={false} onSubmit={onSubmit} />);
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByLabelText('Lücke 1 von 2'), { target: { value: 'sind' } });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(screen.getByLabelText('Lücke 2 von 2'), { target: { value: ' gegessen ' } });
    expect(check().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'cloze',
        gaps: [
          { id: 'g1', text: 'sind' },
          { id: 'g2', text: 'gegessen' },
        ],
      },
      'sind · gegessen',
      'typed',
    );
    // The text around the gaps is there, word by word.
    expect(screen.getByText('Gestern')).toBeDefined();
    expect(screen.getByText('Zoo')).toBeDefined();
  });
});

describe('a cloze with a word bank', () => {
  it('a tapped word fills the active gap; the next empty one is active', () => {
    renderInApp(
      <ClozeAnswer view={BANKED} draftKey="c2" disabled={false} onSubmit={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Wasser' }));
    expect(screen.getByRole('button', { name: 'Lücke 1 von 3: Wasser' })).toBeDefined();
    // The word stays in the bank, but used: nothing jumps under her finger.
    const used = screen.getByRole('button', { name: 'Wasser, schon eingesetzt' });
    expect(used.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Sauerstoff' }));
    expect(screen.getByRole('button', { name: 'Lücke 2 von 3: Sauerstoff' })).toBeDefined();
  });

  it('a tap on a filled gap empties it, gives the word back, and fills it next', () => {
    const onSubmit = vi.fn();
    renderInApp(<ClozeAnswer view={BANKED} draftKey="c3" disabled={false} onSubmit={onSubmit} />);
    for (const word of ['Wasser', 'Stickstoff', 'Zucker']) {
      fireEvent.click(screen.getByRole('button', { name: word }));
    }
    // Changed her mind about the second one.
    fireEvent.click(screen.getByRole('button', { name: 'Lücke 2 von 3: Stickstoff' }));
    expect(screen.getByRole('button', { name: 'Lücke 2 von 3' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Stickstoff' })).toBeDefined();
    const check = screen.getByRole('button', { name: 'Prüfen' });
    expect(check.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Sauerstoff' }));
    expect(screen.getByRole('button', { name: 'Lücke 2 von 3: Sauerstoff' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'cloze',
        gaps: [
          { id: 'g1', text: 'Wasser' },
          { id: 'g2', text: 'Sauerstoff' },
          { id: 'g3', text: 'Zucker' },
        ],
      },
      'Wasser · Sauerstoff · Zucker',
      'tapped',
    );
  });
});

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('the look of a word bank (design components/practice/Tasks.jsx `WordBank`, `Cloze`, #599)', () => {
  const p = paletteOf('pastell');
  const HOW =
    'Tippe ein Wort an – es landet in der markierten Lücke. Tippe eine Lücke an, um sie zu leeren.';

  it('leaves a used word as an empty dashed outline in its place', () => {
    renderInApp(
      <ClozeAnswer view={BANKED} draftKey="look-c1" disabled={false} onSubmit={() => undefined} />,
    );
    const free = styleOf(screen.getByRole('button', { name: 'Wasser' }).firstElementChild!);
    expect([free.height, free.backgroundColor]).toEqual(['40px', rgb(p.paper)]);
    fireEvent.click(screen.getByRole('button', { name: 'Wasser' }));
    const used = screen.getByRole('button', { name: 'Wasser, schon eingesetzt' });
    const face = styleOf(used.firstElementChild!);
    expect(face.borderTopStyle).toBe('dashed');
    expect(face.backgroundColor).toBe(rgb(p.canvas));
    // Its place is kept, its word is not shown.
    expect(used.textContent).toBe('Wasser');
    expect(styleOf(used.firstElementChild!.firstElementChild!).opacity).toBe('0');
  });

  it('draws a gap with the board’s states: dashed while empty, light primary once filled', () => {
    renderInApp(
      <ClozeAnswer view={BANKED} draftKey="look-c2" disabled={false} onSubmit={() => undefined} />,
    );
    const second = styleOf(
      screen.getByRole('button', { name: 'Lücke 2 von 3' }).firstElementChild!,
    );
    expect([second.height, second.borderTopStyle]).toEqual(['36px', 'dashed']);
    expect(second.backgroundColor).toBe(rgb(p.canvas));
    // The gap the next word fills carries the selected frame.
    const first = styleOf(screen.getByRole('button', { name: 'Lücke 1 von 3' }).firstElementChild!);
    expect([first.borderTopStyle, first.borderTopColor]).toEqual(['solid', rgb(p.primary)]);
    fireEvent.click(screen.getByRole('button', { name: 'Wasser' }));
    const filled = screen.getByRole('button', { name: 'Lücke 1 von 3: Wasser' });
    expect(styleOf(filled.firstElementChild!).backgroundColor).toBe(rgb(p.primaryLt));
    // Its target is still a full touch target.
    expect(styleOf(filled).minHeight).toBe('44px');
  });

  it('says how under the bank until the first word is placed, and never without a bank', () => {
    const banked = renderInApp(
      <ClozeAnswer view={BANKED} draftKey="look-c3" disabled={false} onSubmit={() => undefined} />,
    );
    const how = screen.getByText(HOW);
    const bank = screen.getByTestId('cloze-bank');
    expect(bank.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Wasser' }));
    expect(screen.queryByText(HOW)).toBeNull();
    banked.unmount();
    renderInApp(
      <ClozeAnswer view={TYPED} draftKey="look-c4" disabled={false} onSubmit={() => undefined} />,
    );
    expect(screen.queryByText(HOW)).toBeNull();
  });
});
