import { describe, expect, it } from 'vitest';

import { mathSpans } from '../../math/parse.js';
import { closedStream, markdownBlocks, markdownPlain } from '../markdown.js';
import { notation } from '../notation.js';

// $…$ math is the learning domain's notation, given as at app start (lib/learning/register.tsx).
notation.fill(mathSpans);

describe('markdownBlocks', () => {
  it('keeps a reply without Markdown as one paragraph, line breaks included', () => {
    expect(markdownBlocks('Hallo Mia!\nWie geht es dir?')).toEqual([
      { type: 'para', text: 'Hallo Mia!\nWie geht es dir?' },
    ]);
  });
  it('splits paragraphs at blank lines', () => {
    expect(markdownBlocks('Erst das.\n\nDann das.')).toEqual([
      { type: 'para', text: 'Erst das.' },
      { type: 'para', text: 'Dann das.' },
    ]);
  });
  it('reads bulleted lists with -, * and •', () => {
    expect(markdownBlocks('So geht es:\n- Zähler\n* Nenner\n• Bruchstrich')).toEqual([
      { type: 'para', text: 'So geht es:' },
      {
        type: 'list',
        ordered: false,
        items: [
          { marker: '•', text: 'Zähler' },
          { marker: '•', text: 'Nenner' },
          { marker: '•', text: 'Bruchstrich' },
        ],
      },
    ]);
  });
  it('reads numbered lists with their own numbers, and a paragraph after them', () => {
    expect(markdownBlocks('1. Kürzen\n2) Erweitern\n\nFertig!')).toEqual([
      {
        type: 'list',
        ordered: true,
        items: [
          { marker: '1.', text: 'Kürzen' },
          { marker: '2.', text: 'Erweitern' },
        ],
      },
      { type: 'para', text: 'Fertig!' },
    ]);
  });
  it('starts a new list when bullets turn into numbers', () => {
    const blocks = markdownBlocks('- a\n1. b');
    expect(blocks.map((b) => (b.type === 'list' ? b.ordered : 'para'))).toEqual([false, true]);
  });
  it('joins an indented line to the item above it', () => {
    expect(markdownBlocks('- Zähler\n  steht oben')).toEqual([
      { type: 'list', ordered: false, items: [{ marker: '•', text: 'Zähler\nsteht oben' }] },
    ]);
  });
  it('keeps bold and italic inline (MathText draws them) and a star in a sum as text', () => {
    expect(markdownBlocks('**Tipp:** *erst* kürzen, 2 * 3 = 6')).toEqual([
      { type: 'para', text: '**Tipp:** *erst* kürzen, 2 * 3 = 6' },
    ]);
  });
  it('makes a heading a bold line', () => {
    expect(markdownBlocks('## Brüche\nText')).toEqual([{ type: 'para', text: '**Brüche**\nText' }]);
  });
  it('never splits a formula at a line break inside it', () => {
    expect(markdownBlocks('- $\\frac{1}\n{2}$ ist ein Bruch')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [{ marker: '•', text: '$\\frac{1}\n{2}$ ist ein Bruch' }],
      },
    ]);
  });
  it('leaves HTML as the characters it is', () => {
    expect(markdownBlocks('<b>fett</b> <script>x</script>')).toEqual([
      { type: 'para', text: '<b>fett</b> <script>x</script>' },
    ]);
  });
});

describe('markdownPlain', () => {
  it('drops the markers, keeps the numbers and the math', () => {
    expect(markdownPlain('**Tipp:** *erst* kürzen\n\n1. $\\frac{6}{8}$\n2. _fertig_')).toBe(
      'Tipp: erst kürzen\n\n1. $\\frac{6}{8}$\n2. fertig',
    );
  });
  it('writes bullets as •, and leaves them out when spoken', () => {
    expect(markdownPlain('- a\n- b')).toBe('• a\n• b');
    expect(markdownPlain('- a\n- b', { spoken: true })).toBe('a.\nb.');
  });
  it('leaves a formula with stars and underscores alone', () => {
    expect(markdownPlain('Rechne $a_1 * b_2$')).toBe('Rechne $a_1 * b_2$');
  });
});

describe('closedStream', () => {
  it('shows a formula only once it is complete', () => {
    expect(closedStream('Das ist $\\frac{3}{')).toBe('Das ist ');
    expect(closedStream('Das ist $\\frac{3}{4}$.')).toBe('Das ist $\\frac{3}{4}$.');
  });
  it('drops a bold marker that is not closed yet', () => {
    expect(closedStream('Das ist **wich')).toBe('Das ist wich');
    expect(closedStream('Das ist **wichtig**')).toBe('Das ist **wichtig**');
  });
});

describe('markdownPlain spoken', () => {
  it('ends every list item as a sentence, and leaves paragraphs as written', () => {
    expect(markdownPlain('Merk dir:\n- Zähler oben\n- Nenner unten!', { spoken: true })).toBe(
      'Merk dir:\n\nZähler oben.\nNenner unten!',
    );
  });
});
