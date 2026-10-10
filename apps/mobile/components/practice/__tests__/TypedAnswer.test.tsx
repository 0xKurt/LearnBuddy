// A typed answer (issue #365): it is written in the app's one input bar, pinned at the bottom
// right above "Prüfen" like the chat's — and the keys over it (issue #239): which ones a question
// gets, chosen from the question, and what a raise/lower key does to the digit she types next.
// What the row LOOKS like — one line, nothing cut off — is a matter of layout, which jsdom does
// not do; the walkthrough measures it (tests/web, issue #239 spec).

import type { ItemKind, SubjectKind } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { TypedAnswer } from '../TypedAnswer.js';
import { writingRows } from '../WritingSheet.js';
import type { WorkTarget } from '../useWorkPhoto.js';

function show(
  kind: ItemKind,
  prompt: string,
  subjectKind: SubjectKind | null,
  work: WorkTarget | null = null,
) {
  const seen = { value: '' };
  function Harness() {
    const [value, setValue] = useState('');
    seen.value = value;
    return (
      <TypedAnswer
        kind={kind}
        prompt={prompt}
        unit={null}
        subjectKind={subjectKind}
        lang={null}
        value={value}
        disabled={false}
        onChange={setValue}
        onCheck={() => undefined}
        work={work}
      />
    );
  }
  renderInApp(<Harness />);
  return seen;
}

const field = () => screen.getByLabelText('Deine Antwort');
/** The input bar's box: her lines and, under them, its row of tools (issue #522). */
const box = () => field().parentElement!.parentElement!;
const tap = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
/** One character typed on the phone's keyboard: the field reports its whole new text. */
function type(seen: { value: string }, chars: string) {
  for (const ch of chars) fireEvent.change(field(), { target: { value: seen.value + ch } });
}

describe('a typed answer is written in the one input bar (issue #365)', () => {
  it('stands in the pinned bar right above "Prüfen", not under the question', () => {
    show('long', 'Erklär mir, warum der Mond Phasen hat.', null);
    const bottom = screen.getByTestId('bottom-bar');
    const input = field();
    const check = screen.getByRole('button', { name: 'Prüfen' });
    expect(bottom.contains(input)).toBe(true);
    expect(bottom.contains(check)).toBe(true);
    // The field comes before "Prüfen" in the bar, and nothing of it is in an answer slot.
    expect(input.compareDocumentPosition(check) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('answer-slot')).toBeNull();
    // The bar's own mic at its end, like the chat's.
    expect(screen.getByRole('button', { name: 'Antwort sagen' })).toBeDefined();
  });

  it('while she types, "Prüfen" stands in the box itself, like the chat\'s send arrow', () => {
    const seen = show('long', 'Erklär mir, warum der Mond Phasen hat.', null);
    fireEvent.focus(field());
    // Nothing to check yet: no "Prüfen" at all.
    expect(screen.queryByRole('button', { name: 'Prüfen' })).toBeNull();
    type(seen, 'Weil');
    const checks = screen.getAllByRole('button', { name: 'Prüfen' });
    expect(checks).toHaveLength(1);
    // In the box's row of tools, under her text and where the chat sends (#522): her line has the
    // full width, and the mic stays beside it.
    expect(box().contains(checks[0]!)).toBe(true);
    expect(field().parentElement!.contains(checks[0]!)).toBe(false);
    expect(box().contains(screen.getByRole('button', { name: 'Antwort sagen' }))).toBe(true);
    fireEvent.blur(field());
    expect(screen.getAllByRole('button', { name: 'Prüfen' })).toHaveLength(1);
    expect(box().contains(screen.getByRole('button', { name: 'Prüfen' }))).toBe(false);
  });

  it('keeps the box one line while it is empty, the tools beside the text (#522)', () => {
    show('numeric', 'Wie groß ist die Fläche?', 'math');
    // Empty: the mic stands in the same row as the field.
    expect(
      field().parentElement!.contains(screen.getByRole('button', { name: 'Antwort sagen' })),
    ).toBe(true);
  });
});

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

  it('takes a long text of up to 12 000 characters in a taller bar (#258)', () => {
    show('essay', 'Erörtere: Sollte es an Schulen ein Handyverbot geben?', 'german');
    expect(field().getAttribute('maxlength')).toBe('12000');
    // Prose: no math row to type it with.
    fireEvent.focus(field());
    expect(screen.queryByRole('toolbar')).toBeNull();
    // A page to write on: three lines from the start, where every other answer has one.
    expect(field().getAttribute('rows')).toBe('3');
  });

  it('keeps every other answer at 2000 characters in the one-line bar', () => {
    show('long', 'Erklär mir, warum der Mond Phasen hat.', null);
    expect(field().getAttribute('maxlength')).toBe('2000');
    expect(field().getAttribute('rows')).toBe('1');
  });
});

describe('her working, photographed (issue #444)', () => {
  const work = { sessionId: 's1', itemId: 'i1' };
  const camera = () => screen.queryByRole('button', { name: 'Foto von deinem Rechenweg' });

  it('offers the camera at the bar where a path is checked', () => {
    show('numeric', 'Löse die Gleichung 2x + 3 = 7.', 'math', work);
    expect(camera()).not.toBeNull();
    expect(screen.getByTestId('bottom-bar').contains(camera())).toBe(true);
  });

  it('offers none where a line break means nothing (a vocabulary word)', () => {
    show('vocab', 'der Hund', null, work);
    expect(camera()).toBeNull();
  });

  it('offers none without the question it is read for', () => {
    show('numeric', 'Löse die Gleichung 2x + 3 = 7.', 'math');
    expect(camera()).toBeNull();
  });
});

describe('the essay has room to be written (issue #525)', () => {
  it('shows at least twelve lines on a 390 × 844 phone, six with the keyboard up', () => {
    expect(writingRows(844)).toBeGreaterThanOrEqual(12);
    // 390 × 844 with the keyboard: about 508 pt are left (lib/keyboard.ts, issue #289).
    expect(writingRows(508)).toBeGreaterThanOrEqual(6);
    // 360 × 740 with the keyboard: about 440.
    expect(writingRows(440)).toBeGreaterThanOrEqual(4);
  });

  it('opens the writing view on the same text, and checks from there', () => {
    let checked: string | null = null;
    function Harness() {
      const [value, setValue] = useState('Viele Schulen verbieten Handys.');
      return (
        <TypedAnswer
          kind="essay"
          prompt="Erörtere: Sollte es an Schulen ein Handyverbot geben?"
          unit={null}
          subjectKind="german"
          lang={null}
          value={value}
          disabled={false}
          onChange={setValue}
          onCheck={(v) => (checked = v)}
        />
      );
    }
    renderInApp(<Harness />);
    tap('Groß schreiben');
    const fields = screen.getAllByLabelText('Deine Antwort');
    expect(fields).toHaveLength(2);
    const page = fields[1]!;
    // A page, not the bar's three lines (how many: `writingRows`, from the height there is).
    expect(Number(page.getAttribute('rows'))).toBeGreaterThan(
      Number(fields[0]!.getAttribute('rows')),
    );
    expect((page as HTMLTextAreaElement).value).toBe('Viele Schulen verbieten Handys.');
    fireEvent.change(page, { target: { value: 'Viele Schulen verbieten Handys. Zu Recht.' } });
    // The bar holds the same text: nothing is lost when the view closes.
    expect((fields[0] as HTMLTextAreaElement).value).toBe(
      'Viele Schulen verbieten Handys. Zu Recht.',
    );
    const checks = screen.getAllByRole('button', { name: 'Prüfen' });
    fireEvent.click(checks[checks.length - 1]!);
    expect(checked).toBe('Viele Schulen verbieten Handys. Zu Recht.');
  });
});

describe('one box, nothing mirrored (issue #522)', () => {
  const preview = () => screen.queryByLabelText(/^Vorschau deiner Antwort/);

  it('shows the preview only while the line looks different when set', () => {
    const seen = show('numeric', 'Wie viel ist drei Viertel von 1?', 'math');
    fireEvent.focus(field());
    type(seen, '3/4');
    expect(preview()).not.toBeNull();
    // Back to plain digits: nothing to draw, nothing repeated under her "29".
    fireEvent.change(field(), { target: { value: '29' } });
    expect(preview()).toBeNull();
  });

  it('shows the unit as a chip among the tools, not inside her line', () => {
    renderInApp(
      <TypedAnswer
        kind="numeric"
        prompt="Wie groß ist die Fläche?"
        unit="cm²"
        subjectKind="math"
        lang={null}
        value="28"
        disabled={false}
        onChange={() => undefined}
        onCheck={() => undefined}
      />,
    );
    const chip = screen.getByText('in cm²');
    expect(box().contains(chip)).toBe(true);
    expect(field().parentElement!.contains(chip)).toBe(false);
  });

  it('says only "Antwort …" beside a unit chip, so the narrow field keeps one line (#387)', () => {
    const empty = (unit: string | null) =>
      renderInApp(
        <TypedAnswer
          kind="numeric"
          prompt="Wie groß ist die Fläche?"
          unit={unit}
          subjectKind="math"
          lang={null}
          value=""
          disabled={false}
          onChange={() => undefined}
          onCheck={() => undefined}
        />,
      );
    const withUnit = empty('cm²');
    expect(field().getAttribute('placeholder')).toBe('Antwort …');
    withUnit.unmount();
    empty(null);
    expect(field().getAttribute('placeholder')).toBe('Deine Antwort …');
  });
});
