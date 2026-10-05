// Lückentext, Regel 0 in both directions (issues #224, #232): what the model wrote is checked
// before it is stored — every rejection the issue names is a test here — and what she writes
// into the gaps is checked gap by gap with the rules every written answer meets. Reached
// through the functions the server uses (`structuredItem`, `checkStructured`).

import { describe, expect, it } from 'vitest';

import {
  checkCloze,
  clozeProblem,
  clozeReply,
  clozeTaskFrom,
  clozeVerdict,
  type ClozeDraftBase,
} from '../cloze.js';
import {
  answerTextOf,
  checkStructured,
  partsVia,
  secretsOf,
  solutionOf,
  structuredItem,
  structuredItems,
  structuredReply,
  structuredTaskOf,
  structuredVerdict,
  viewOf,
} from '../structured.js';

/** Five gaps, typed: the Perfekt in a short story. */
const PERFEKT = {
  text: 'Gestern ___ wir in den Zoo gegangen. Zuerst ___ wir die Affen angeschaut. Dann hat mein Bruder ein Eis ___. Am Abend ___ wir müde nach Hause gefahren. Es war ein ___ Tag.',
  keys: ['sind', 'haben', 'gegessen', 'sind', 'schöner'],
};

/** Three gaps with a word bank: one distractor. */
const FOTOSYNTHESE = {
  text: 'Pflanzen nehmen mit den Wurzeln ___ auf. In den Blättern entsteht mit Hilfe von Sonnenlicht ___. Dabei geben sie ___ an die Luft ab.',
  keys: ['Wasser', 'Traubenzucker', 'Sauerstoff'],
  bank: ['Wasser', 'Traubenzucker', 'Sauerstoff', 'Stickstoff'],
};

function draft(
  text: string,
  keys: Array<string | { answer: string; accepted_answers: string[] }>,
  over: Partial<ClozeDraftBase> = {},
): ClozeDraftBase {
  return {
    type: 'cloze',
    prompt: 'Setze die passenden Wörter ein.',
    text,
    gaps: keys.map((k) => (typeof k === 'string' ? { answer: k, accepted_answers: [] } : k)),
    word_bank: null,
    spelling: null,
    topic: 'Perfekt',
    difficulty: 2,
    prompt_lang: 'de',
    ...over,
  };
}

function built(d: ClozeDraftBase) {
  const r = clozeTaskFrom(d);
  if (!('task' in r)) throw new Error(`rejected: ${r.problem}`);
  return r.task;
}

const problemOf = (d: ClozeDraftBase) => {
  const r = clozeTaskFrom(d);
  return 'problem' in r ? r.problem : null;
};

/** Her answer: these words into the gaps, in reading order. */
const fill = (words: string[]) => ({
  type: 'cloze' as const,
  gaps: words.map((text, i) => ({ id: `g${i + 1}`, text })),
});

/** Nine different words, none of them in "Hier steht ___." */
const FRUIT = [
  'Apfel',
  'Birne',
  'Kirsche',
  'Pflaume',
  'Banane',
  'Mango',
  'Melone',
  'Traube',
  'Feige',
];

const GERMAN = { spelling: null, subject_kind: 'german' } as const;
const BIOLOGY = { spelling: null, subject_kind: 'biology' } as const;

describe('cloze: what the model wrote (Regel 0)', () => {
  it('cuts the text at its gaps, names them and keeps the keys out of the view', () => {
    const task = built(draft(PERFEKT.text, PERFEKT.keys));
    expect(task.gaps.map((g) => g.id)).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
    expect(task.segments).toHaveLength(6);
    expect(task.segments[0]).toBe('Gestern ');
    expect(task.bank).toBeNull();
    expect(solutionOf(task)).toBe(
      'Gestern sind wir in den Zoo gegangen. Zuerst haben wir die Affen angeschaut. Dann hat mein Bruder ein Eis gegessen. Am Abend sind wir müde nach Hause gefahren. Es war ein schöner Tag.',
    );
    const view = viewOf(task);
    expect(view).toEqual({
      type: 'cloze',
      segments: task.segments,
      gaps: ['g1', 'g2', 'g3', 'g4', 'g5'],
      bank: null,
    });
    for (const key of PERFEKT.keys) expect(JSON.stringify(view)).not.toContain(key);
    // What is stored reads back as the same task (and passes Regel 0 again).
    expect(structuredTaskOf(JSON.parse(JSON.stringify(task)), 'cloze')).toEqual(task);
    expect(structuredTaskOf(task, 'order')).toBeNull();
  });

  it('shuffles the bank once, the same way every time, never in the order of the gaps', () => {
    const d = draft(FOTOSYNTHESE.text, FOTOSYNTHESE.keys, { word_bank: FOTOSYNTHESE.bank });
    const task = built(d);
    expect([...(task.bank ?? [])].sort()).toEqual([...FOTOSYNTHESE.bank].sort());
    expect(task.bank).not.toEqual(FOTOSYNTHESE.bank);
    expect(built(d).bank).toEqual(task.bank);
    expect(viewOf(task)).toMatchObject({ bank: task.bank });
  });

  it('rejects a gap without a key', () => {
    expect(problemOf(draft(PERFEKT.text, ['sind', '', 'gegessen', 'sind', 'schöner']))).toBe(
      'gap_without_key',
    );
    expect(problemOf(draft(PERFEKT.text, ['sind', '   ', 'gegessen', 'sind', 'schöner']))).toBe(
      'gap_without_key',
    );
  });

  it('rejects gap marks and keys that do not agree in number', () => {
    expect(problemOf(draft(PERFEKT.text, PERFEKT.keys.slice(0, 4)))).toBe('gaps_mismatch');
    expect(problemOf(draft(`${PERFEKT.text} Und ___.`, PERFEKT.keys))).toBe('gaps_mismatch');
    // A text without any gap mark is no cloze at all.
    expect(problemOf(draft('Ein Text ohne Lücke.', ['a', 'b']))).toBe('gaps_mismatch');
  });

  it('rejects fewer than two and more than eight gaps', () => {
    expect(problemOf(draft('Gestern ___ wir gegangen.', ['sind']))).toBe('gap_count');
    const nine = Array.from({ length: 9 }, () => `Hier steht ___.`).join(' ');
    expect(
      problemOf(
        draft(
          nine,
          Array.from({ length: 9 }, (_, i) => FRUIT[i]!),
        ),
      ),
    ).toBe('gap_count');
    const eight = Array.from({ length: 8 }, () => `Hier steht ___.`).join(' ');
    expect(
      problemOf(
        draft(
          eight,
          Array.from({ length: 8 }, (_, i) => FRUIT[i]!),
        ),
      ),
    ).toBeNull();
  });

  it('rejects what no longer fits 360×740: a text over 260 characters, an instruction over 80', () => {
    const fill = (n: number) => 'Ein Satz ohne Ende. '.repeat(n);
    // 20 characters per sentence: 13 of them and the frame are 276, 12 are 256.
    const long = `${fill(13)}Hier ___ und dort ___.`;
    expect(long.replace(/_{3,}/g, '').length).toBe(276);
    expect(problemOf(draft(long, ['Kuh', 'Hof']))).toBe('text_too_long');
    expect(problemOf(draft(`${fill(12)}Hier ___ und dort ___.`, ['Kuh', 'Hof']))).toBeNull();
    const instruction = 'Setze die Verben ein. '.repeat(4);
    expect(instruction.trim().length).toBeGreaterThan(80);
    expect(
      problemOf(draft('Hier ___ und dort ___.', ['Kuh', 'Hof'], { prompt: instruction })),
    ).toBe('prompt_too_long');
    expect(
      problemOf(
        draft('Hier ___ und dort ___.', ['Kuh', 'Hof'], { prompt: instruction.slice(0, 80) }),
      ),
    ).toBeNull();
  });

  it('rejects a key longer than a gap', () => {
    expect(problemOf(draft('Hier ___ und dort ___.', ['eins', 'x'.repeat(41)]))).toBe(
      'gap_too_long',
    );
  });

  it('rejects a key that can already be read in the text or the instruction', () => {
    // A short key as a word of its own …
    expect(
      problemOf(
        draft('Wir sind müde. Gestern ___ wir gegangen und ___ geblieben.', ['sind', 'sind']),
      ),
    ).toBe('key_in_text');
    // … a longer one anywhere, in any case …
    expect(
      problemOf(draft('Wasser ist nass. Die Wurzel nimmt ___ und ___ auf.', ['wasser', 'Salze'])),
    ).toBe('key_in_text');
    // … and in the instruction too.
    expect(
      problemOf(
        draft(FOTOSYNTHESE.text, FOTOSYNTHESE.keys, {
          prompt: 'Setze Wasser, Traubenzucker und Sauerstoff ein.',
        }),
      ),
    ).toBe('key_in_text');
  });

  it('rejects a word bank that does not hold every key exactly once', () => {
    const d = (bank: string[]) => draft(FOTOSYNTHESE.text, FOTOSYNTHESE.keys, { word_bank: bank });
    // A key missing.
    expect(problemOf(d(['Wasser', 'Traubenzucker', 'Stickstoff']))).toBe('bank_not_once');
    // A key twice (in any case): a word twice in the bank.
    expect(problemOf(d([...FOTOSYNTHESE.bank, 'wasser']))).toBe('bank_duplicate');
    // Two gaps with the same key cannot both be filled from a bank that has it once.
    expect(
      problemOf(
        draft(PERFEKT.text, PERFEKT.keys, {
          word_bank: ['sind', 'haben', 'gegessen', 'schöner'],
        }),
      ),
    ).toBe('bank_not_once');
    // Too many words to choose from.
    expect(
      problemOf(d([...FOTOSYNTHESE.bank, ...Array.from({ length: 9 }, (_, i) => `Stoff${i}`)])),
    ).toBe('bank_duplicate');
    // Distractors are fine.
    expect(problemOf(d(FOTOSYNTHESE.bank))).toBeNull();
  });

  it('rejects a distractor a gap would accept as right', () => {
    expect(
      problemOf(
        draft(
          FOTOSYNTHESE.text,
          ['Wasser', { answer: 'Traubenzucker', accepted_answers: ['Glucose'] }, 'Sauerstoff'],
          { word_bank: [...FOTOSYNTHESE.keys, 'Glucose'] },
        ),
      ),
    ).toBe('bank_ambiguous');
  });

  it('a draft that fails gives no question; the others of the set stay', () => {
    const bad = draft(PERFEKT.text, PERFEKT.keys.slice(0, 2));
    expect(structuredItem(bad)).toBeNull();
    const good = draft(PERFEKT.text, PERFEKT.keys);
    const items = structuredItems([bad, good], new Set(['cloze']));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'cloze', prompt: 'Setze die passenden Wörter ein.' });
    // Not allowed where it was not asked for.
    expect(structuredItems([good], new Set(['order']))).toEqual([]);
  });

  it('drops a prepared hint that names a key; keeps one that does not', () => {
    const item = structuredItem({
      ...draft(FOTOSYNTHESE.text, FOTOSYNTHESE.keys, { word_bank: FOTOSYNTHESE.bank }),
      hints: ['Was braucht eine Pflanze zum Leben?', 'In die erste Lücke gehört Wasser.'],
      worked_solution: null,
    });
    expect(item?.hints).toEqual(['Was braucht eine Pflanze zum Leben?']);
    const task = item!.task;
    expect(secretsOf(task, item!.prompt).secrets).toEqual(FOTOSYNTHESE.keys);
  });
});

describe('cloze: her answer, gap by gap (Regel 0)', () => {
  const typed = built(draft(PERFEKT.text, PERFEKT.keys));
  const banked = built(
    draft(FOTOSYNTHESE.text, FOTOSYNTHESE.keys, { word_bank: FOTOSYNTHESE.bank }),
  );

  it('every gap right is right, by the rules alone', () => {
    const check = checkStructured(typed, fill(PERFEKT.keys), GERMAN);
    expect(check?.correct).toBe(true);
    expect(check && structuredVerdict(check)).toBe('correct');
    expect(check?.type === 'cloze' && check.gaps.every((g) => g.by === 'rule')).toBe(true);
    expect(answerTextOf(typed, fill(PERFEKT.keys), 'de')).toBe(
      'sind · haben · gegessen · sind · schöner',
    );
  });

  it('names the one wrong gap by her word; the others stay right', () => {
    // A tapped word of the bank that belongs elsewhere is wrong for sure — no model.
    const answer = fill(['Wasser', 'Sauerstoff', 'Traubenzucker']);
    const check = checkCloze(banked, answer, BIOLOGY)!;
    expect(check.gaps.map((g) => g.verdict)).toEqual(['right', 'wrong', 'wrong']);
    expect(clozeVerdict(check)).toBe('incorrect');
    expect(structuredReply('de', check)).toBe(
      '1 von 3 Lücken stimmt schon. Bei „Sauerstoff“, „Traubenzucker“ passt es noch nicht.',
    );
    // A distractor is wrong for sure too.
    const distractor = checkCloze(
      banked,
      fill(['Stickstoff', 'Traubenzucker', 'Sauerstoff']),
      BIOLOGY,
    )!;
    expect(distractor.gaps.map((g) => g.verdict)).toEqual(['wrong', 'right', 'right']);
    expect(clozeReply('de', distractor)).toBe(
      '2 von 3 Lücken stimmen schon. Bei „Stickstoff“ passt es noch nicht.',
    );
  });

  it('says so kindly when no gap is right yet', () => {
    const check = checkCloze(banked, fill(['Stickstoff', 'Wasser', 'Traubenzucker']), BIOLOGY)!;
    expect(clozeReply('de', check)).toBe('Noch nicht ganz – schau dir die Lücken nochmal an.');
  });

  it('a near miss is named as one, not as wrong: a typo, accents, case where spelling counts', () => {
    // A small slip in a long word.
    const typo = checkCloze(typed, fill(['sind', 'haben', 'gegesen', 'sind', 'schöner']), GERMAN)!;
    expect(typo.gaps[2]).toMatchObject({ verdict: 'near', rule: 'typo' });
    expect(clozeVerdict(typo)).toBe('partially_correct');
    expect(clozeReply('de', typo)).toBe(
      '4 von 5 Lücken stimmen schon. Bei „gegesen“ fehlt nur noch eine Kleinigkeit in der Schreibweise.',
    );
    // Accents missing.
    const accents = checkCloze(
      typed,
      fill(['sind', 'haben', 'gegessen', 'sind', 'schoner']),
      GERMAN,
    )!;
    expect(accents.gaps[4]).toMatchObject({ verdict: 'near', rule: 'close' });
    // German is a language subject: capitalisation is the point — a near miss.
    const strict = checkCloze(
      typed,
      fill(['Sind', 'haben', 'gegessen', 'sind', 'schöner']),
      GERMAN,
    )!;
    expect(strict.gaps[0]).toMatchObject({ verdict: 'near', rule: 'spelling' });
    // In biology it is not: no rule decides, the gap stays open for the model.
    const gentle = checkCloze(banked, fill(['wasser', 'Traubenzucker', 'Sauerstoff']), BIOLOGY)!;
    expect(gentle.gaps[0]).toMatchObject({ verdict: 'open', rule: 'folded', by: null });
  });

  it('an accepted form is right; a number with another value is wrong; anything else is open', () => {
    const task = built(
      draft('Ein Jahr hat ___ Monate und ___ Tage.', [
        '12',
        { answer: '365', accepted_answers: ['dreihundertfünfundsechzig'] },
      ]),
    );
    const accepted = checkCloze(task, fill(['12', 'dreihundertfünfundsechzig']), GERMAN)!;
    expect(accepted.correct).toBe(true);
    const number = checkCloze(task, fill(['11', '365']), GERMAN)!;
    expect(number.gaps.map((g) => g.verdict)).toEqual(['wrong', 'right']);
    // Without a bank, a word no rule knows is the model's to judge — and until it has,
    // nothing is claimed: no verdict.
    const unknown = checkCloze(
      typed,
      fill(['waren', 'haben', 'gegessen', 'sind', 'schöner']),
      GERMAN,
    )!;
    expect(unknown.gaps[0]).toMatchObject({ verdict: 'open', rule: 'unknown', by: null });
    expect(clozeVerdict(unknown)).toBeNull();
  });

  it('refuses an answer that does not fit the task: a gap missing, twice, or not there', () => {
    expect(checkCloze(typed, fill(PERFEKT.keys.slice(0, 4)), GERMAN)).toBeNull();
    const twice = fill(PERFEKT.keys);
    twice.gaps[4] = { id: 'g1', text: 'sind' };
    expect(checkCloze(typed, twice, GERMAN)).toBeNull();
    const unknown = fill(PERFEKT.keys);
    unknown.gaps[4] = { id: 'g9', text: 'schöner' };
    expect(checkCloze(typed, unknown, GERMAN)).toBeNull();
    // Another kind's answer.
    expect(checkStructured(typed, { type: 'order', order: ['a', 'b', 'c'] })).toBeNull();
  });

  it('a bank is tapped, a cloze without one is typed (issue #163)', () => {
    expect(partsVia(banked)).toBe('tapped');
    expect(partsVia(typed)).toBe('typed');
  });

  it('a stored task that no longer passes Regel 0 is no task', () => {
    const leaky = { ...typed, segments: ['Wir sind ', ' da ', ' und ', ' dort ', ' hier ', '.'] };
    expect(clozeProblem(leaky)).toBe('key_in_text');
    expect(structuredTaskOf(leaky, 'cloze')).toBeNull();
  });
});
