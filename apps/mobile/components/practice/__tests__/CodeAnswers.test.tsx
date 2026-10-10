// Informatik in the app (issue #262). What is held here:
//
//   · the program as shown: its lines with their indentation, numbered where they are asked
//     about, one element a screen reader hears line by line;
//   · "In welcher Zeile?": the program's lines are the board, numbered tiles — a tap answers with
//     the line's number, and the thread says "Zeile 3";
//   · code is typed in the one input bar: no math keys, no mic, the return key takes the line, and
//     a function starts with its first line once she starts writing;
//   · the form is picked by code from the question's surface, and a program she taps on stands in
//     the answer, not twice.
// What it LOOKS like on 360×740 is the walkthrough's to measure, not this layer's.

import type { CodeFigure, ItemView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { answerForm } from '../../../lib/practice/answerForm.js';
import { renderInApp } from '../../../testing/render.js';
import { CodeBlock } from '../CodeBlock.js';
import { CodeLineAnswer } from '../CodeLineAnswer.js';
import { TypedAnswer } from '../TypedAnswer.js';

const PROGRAM: CodeFigure = {
  type: 'code',
  language: 'python',
  lines: ['werte = [4, 0, 2]', 'for w in werte:', '    print(8 / w)'],
  numbered: true,
};

describe('the program as shown', () => {
  it('keeps the indentation and says the program line by line', () => {
    renderInApp(<CodeBlock figure={PROGRAM} />);
    const block = screen.getByTestId('code-block');
    // Every space kept as typed: a browser collapses a run of ordinary ones.
    const nbsp = String.fromCharCode(0xa0);
    expect(block.textContent).toContain('    print(8 / w)'.replace(/ /g, nbsp));
    expect(block.getAttribute('aria-label')).toBe(
      'Programm mit 3 Zeilen. Zeile 1: werte = [4, 0, 2]. Zeile 2: for w in werte:. Zeile 3: print(8 / w)',
    );
  });
});

describe('in which line does it stop?', () => {
  it('answers with the number of the line she taps', () => {
    const onAnswer = vi.fn();
    renderInApp(<CodeLineAnswer figure={PROGRAM} disabled={false} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zeile 3: print(8 / w)' }));
    expect(onAnswer).toHaveBeenCalledWith('3', 'Zeile 3');
  });
});

describe('code in the one input bar', () => {
  function show(purpose: 'output' | 'program' | 'query', starter = '') {
    const seen = { value: '', checked: '' };
    function Harness() {
      const [value, setValue] = useState('');
      seen.value = value;
      return (
        <TypedAnswer
          kind={purpose === 'output' ? 'short' : 'long'}
          prompt="Was gibt dieses Programm aus?"
          unit={null}
          lang={null}
          value={value}
          disabled={false}
          onChange={setValue}
          onCheck={(v) => void (seen.checked = v)}
          code={{ mode: 'code_type', purpose, starter }}
        />
      );
    }
    renderInApp(<Harness />);
    return seen;
  }
  const field = () => screen.getByLabelText('Deine Antwort');

  it('has no math keys and no mic, and starts a function with its first line', () => {
    const seen = show('program', 'def verdoppeln(zahl):\n    ');
    expect(field().getAttribute('placeholder')).toBe('Dein Programm …');
    fireEvent.focus(field());
    expect(seen.value).toBe('def verdoppeln(zahl):\n    ');
    expect(screen.queryByTestId('answer-keys')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Antwort sagen' })).toBeNull();
    expect(field().getAttribute('autocapitalize')).toBe('none');
  });

  it('asks an output in its own words', () => {
    show('output');
    expect(field().getAttribute('placeholder')).toBe('Was steht auf dem Bildschirm?');
  });
});

describe('the form, picked by code', () => {
  const item = (surface: ItemView['surface'], figure: ItemView['figure']) =>
    ({ kind: 'short', choices: null, tap_choices: null, tap: false, surface, figure }) as ItemView;

  it('puts a program she taps on into the answer, and code she writes into the bar', () => {
    const lines = answerForm(item({ mode: 'code_line', lines: 3 }, PROGRAM), true);
    expect(lines.codeLines).toBe(PROGRAM);
    expect(lines.figureInAnswer).toBe(true);
    expect(lines.typed).toBe(false);
    const typed = answerForm(
      item({ mode: 'code_type', purpose: 'output', starter: '' }, PROGRAM),
      true,
    );
    expect(typed.code).toEqual({ mode: 'code_type', purpose: 'output', starter: '' });
    expect(typed.typed).toBe(true);
    expect(typed.figureInAnswer).toBe(false);
    // Closed: the program is read again in the card, nothing to tap or type.
    expect(answerForm(item(null, PROGRAM), false).figureInAnswer).toBe(false);
  });
});
