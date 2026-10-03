// The keys over the answer field (issue #239): which ones a question gets, chosen from the
// question, and what a raise/lower key does to the digit she types next. What the row LOOKS
// like — one line, nothing cut off — is a matter of layout, which jsdom does not do; the
// walkthrough measures it (tests/web, issue #239 spec).

import type { ItemKind, SubjectKind } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { AnswerComposer } from '../AnswerComposer.js';

function show(kind: ItemKind, prompt: string, subjectKind: SubjectKind | null) {
  const seen = { value: '' };
  function Harness() {
    const [value, setValue] = useState('');
    seen.value = value;
    return (
      <AnswerComposer
        kind={kind}
        prompt={prompt}
        unit={null}
        subjectKind={subjectKind}
        lang={null}
        value={value}
        disabled={false}
        onChange={setValue}
        onCheck={() => undefined}
      />
    );
  }
  renderInApp(<Harness />);
  return seen;
}

const field = () => screen.getByLabelText('Deine Antwort');
const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
/** One character typed on the phone's keyboard: the field reports its whole new text. */
function type(seen: { value: string }, chars: string) {
  for (const ch of chars) fireEvent.change(field(), { target: { value: seen.value + ch } });
}

describe('the keys over the answer field (issue #239)', () => {
  it('gives a chemistry formula the chemistry keys, and the index key lowers the next digits', () => {
    const seen = show('formula', 'Stelle die Reaktionsgleichung auf.', 'chemistry');
    fireEvent.focus(field());
    expect(screen.getByRole('toolbar', { name: 'Chemie-Zeichen' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Bruchstrich' })).toBeNull();

    type(seen, '2 H');
    tap('Tiefstellen');
    // On is said in the name, never as an ARIA state a button may not carry.
    expect(screen.getByRole('button', { name: 'Tiefstellen, eingeschaltet' })).toBeDefined();
    type(seen, '2');
    tap('plus');
    type(seen, 'O');
    tap('Tiefstellen');
    type(seen, '2');
    tap('Reaktionspfeil');
    type(seen, '2 H');
    tap('Tiefstellen');
    type(seen, '2O');
    expect(seen.value).toBe('2 H₂ + O₂ → 2 H₂O');
    // The letter ended the mode by itself.
    expect(screen.getByRole('button', { name: 'Tiefstellen' })).toBeDefined();
  });

  it('raises an exponent and offers the comparisons for an inequality', () => {
    const seen = show('formula', 'Für welche $x$ gilt $x^{2} \\le 3$?', 'math');
    fireEvent.focus(field());
    expect(screen.getByRole('toolbar', { name: 'Mathe-Zeichen' })).toBeDefined();
    type(seen, 'x');
    tap('Hochzahl');
    type(seen, '2');
    tap('kleiner gleich');
    type(seen, '3');
    expect(seen.value).toBe('x² ≤ 3');
  });

  it('shows no keys for a word answer', () => {
    show('short', 'Wie heißt die Hauptstadt von Frankreich?', 'geography');
    fireEvent.focus(field());
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
