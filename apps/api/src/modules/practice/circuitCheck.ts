// A question about a circuit or a logic net (issue #261). Its key is COMPUTED from the figure,
// and the model's key must agree with it — or the question is not asked (Regel 0, "reject, never
// repair"; docs/architecture.md §Practice, Circuits).
//
// The figure says what its key is (`ask`); code computes it in @learnbuddy/shared-math
// (`circuit.ts`, `logic.ts`) and holds the question to it:
//
//   · "Leuchtet L2?" and "Reihen- oder Parallelschaltung?" are multiple choice whose options code
//     WRITES, in the question's language, and the model's `correct_choice` must point at the
//     computed one. "Series or parallel" is only asked of a circuit that is plainly one of them;
//   · how many lamps light, and how many rows of a truth table give Q = 1, are whole numbers,
//     and the key must be exactly that number;
//   · the equivalent resistance, an ammeter's and a voltmeter's reading are number questions with
//     a unit (Ω, A or mA, V or mV), converted exactly and written exactly or rounded at the
//     precision they are written in — computed only when every value they need is given;
//   · Q for given inputs is 0 or 1: typed, or one of the two options code writes;
//   · a number asked about a circuit or a net that declares no key is dropped: it could not be
//     checked.
//
// Why the figure declares its key instead of code reading the question: what a sentence asks
// for is language understanding, and a word list standing in for it is what CLAUDE.md rule 3
// forbids. The declaration can be checked; a guess cannot.

import {
  circuitKey,
  circuitProblem,
  isCircuit,
  isLogic,
  logicKey,
  logicProblem,
  ratioValue,
  type Circuit,
  type LogicNet,
} from '@learnbuddy/shared-math';

import { t } from '../../i18n/index.js';
import { asLocale } from './chartRead.js';
import { exactCount, measured } from './figureKey.js';
import type { ItemDraft } from './items.js';
import { fixedChoice } from './treeCheck.js';

/** The options of "Q = ?" as code writes them: the two values, in order. */
const BITS = ['0', '1'];

function checkedLogic<T extends ItemDraft>(it: T, net: LogicNet): T | null {
  if (logicProblem(net) !== null) return null;
  const key = logicKey(net);
  if (key === null) return it.kind === 'numeric' ? null : it;
  if (net.ask === 'out' && it.kind === 'multiple_choice') return fixedChoice(it, BITS, key);
  return exactCount(it, key);
}

function checkedNetwork<T extends ItemDraft>(it: T, c: Circuit, locale: string | null): T | null {
  if (circuitProblem(c) !== null) return null;
  const key = circuitKey(c);
  if (key === null) return it.kind === 'numeric' ? null : it;
  const lang = asLocale(it.prompt_lang) ?? asLocale(locale);
  switch (key.kind) {
    case 'count':
      return exactCount(it, key.n);
    case 'measure':
      return measured(it, ratioValue(key.value), key.unit);
    case 'lit': {
      if (lang === null) return null;
      const lamp = { lamp: c.at };
      const choices = [
        t(lang, 'practice.circuit.lit', lamp),
        t(lang, 'practice.circuit.unlit', lamp),
      ];
      return fixedChoice(it, choices, key.lit ? 0 : 1);
    }
    case 'kind': {
      if (lang === null) return null;
      const choices = [t(lang, 'practice.circuit.series'), t(lang, 'practice.circuit.parallel')];
      return fixedChoice(it, choices, key.parallel ? 1 : 0);
    }
  }
}

/**
 * The item with its circuit or logic question checked, the item unchanged when it asks nothing
 * code could compute, or null when it is not asked at all.
 */
export function checkedCircuit<T extends ItemDraft>(it: T, locale: string | null): T | null {
  const f = it.figure;
  if (f !== null && isLogic(f)) return checkedLogic(it, f);
  if (f !== null && isCircuit(f)) return checkedNetwork(it, f, locale);
  return it;
}
