// What each option of a closed multiple choice says (`choiceMarks`, issue #521): hers from her
// last try, the right one only from the solution the server sent, and never a verdict where none
// is shown (a running test).

import type { PracticeTurnView } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { choiceMarks } from '../choiceMarks.js';

const TWO = '$\\frac{2}{3}$';
const THREE = '$\\frac{3}{5}$';
const CHOICES = [TWO, THREE];

type Turn = Pick<PracticeTurnView, 'role' | 'text' | 'verdict'>;
const mine = (text: string, verdict: Turn['verdict']): Turn => ({
  role: 'learner',
  text,
  verdict,
});
const reply = (text: string): Turn => ({ role: 'tutor', text, verdict: null });

describe('the options of a closed multiple choice', () => {
  it('marks hers as right when she got it, and nothing else', () => {
    const turns = [mine(TWO, 'correct'), reply('Stimmt – gut gemacht!')];
    expect(choiceMarks(CHOICES, turns, null, true)).toEqual(['mine_right', null]);
  });

  it('marks hers as wrong and the right one from the solution after "Lösung zeigen"', () => {
    const turns = [mine(THREE, 'incorrect'), reply('Noch nicht ganz.')];
    expect(choiceMarks(CHOICES, turns, TWO, true)).toEqual(['right', 'mine_wrong']);
  });

  it('keeps an earlier wrong try as tried and her last one as hers', () => {
    const choices = ['A', 'B', 'C'];
    const turns = [mine('A', 'incorrect'), reply('…'), mine('C', 'correct'), reply('Ja!')];
    expect(choiceMarks(choices, turns, null, true)).toEqual(['tried', null, 'mine_right']);
  });

  it('never tells the right one without the solution (homework help)', () => {
    const turns = [mine(THREE, 'incorrect')];
    expect(choiceMarks(CHOICES, turns, null, true)).toEqual([null, 'mine_wrong']);
  });

  it('marks hers without a verdict in a running test', () => {
    const turns = [mine(THREE, 'incorrect'), reply("Notiert – weiter geht's.")];
    expect(choiceMarks(CHOICES, turns, null, false)).toEqual([null, 'mine']);
  });

  it('marks none as hers when what she said names no option word for word, or she asked', () => {
    const asked = mine('Was heißt größer?', 'not_an_attempt');
    expect(choiceMarks(CHOICES, [mine('zwei Drittel', 'correct'), asked], TWO, true)).toEqual([
      'right',
      null,
    ]);
  });

  it('marks only the right one when she skipped without a try', () => {
    expect(choiceMarks(CHOICES, [], THREE, true)).toEqual([null, 'right']);
  });
});
