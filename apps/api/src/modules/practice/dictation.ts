// Diktat: Buddy reads a word or a sentence aloud, she types it (issue #242, contracts/dictation.ts).
//
// Nothing here speaks, caches or plays. The recording is the Hörverstehen chain of issue #210
// (`practice/listen.ts`, `POST /practice/sessions/:id/listen`), fed with the KEY: a Diktat
// question stores its word as `items.answer` and the very same string as `items.listen_task.text`,
// and migration 0081 refuses a row where the two differ. So the voice can never read a text a
// model rephrased, and her answer is never checked against something she did not hear.
//
// What this module decides — all of it by code, none of it by a model (#224 "Regel 0"):
//
//   · Which entries become questions (`dictationItems`). Where the words come from a list — one
//     she typed, or a sheet she photographed — every entry must stand in that list WORD FOR WORD,
//     in its own spelling. The model only picks the entries out; an entry it "corrected", invented
//     or merged is not one of hers and is dropped, never repaired. Where she named a spelling
//     topic ("ie-Wörter") the words are Buddy's own, and then only their shape is checked —
//     there is no list to hold them to, and the card says "Frage von Buddy".
//   · Whether her answer is right (`checkDictation`): exactly, with case, ß/ss and punctuation.
//     Only what no keyboard makes a spelling decision is folded: runs of spaces, the kind of
//     apostrophe or quotation mark, Unicode composition.
//   · Where it went wrong (`checkDictation`, `wordSpot`): a character diff of her word against the key, read for
//     the PLACE — a missing double consonant, an e missing after i, ß for ss, a capital — and
//     said in one friendly sentence (`dictationReply`). It names her own word and the spot,
//     never the key spelled out: that comes with "Lösung zeigen" or the third miss, like
//     everywhere else. This is a comparison of two strings, not language understanding and no
//     word list (CLAUDE.md rule 3): "Doppel-m" is read off the key having two m where she has one.

import {
  DICTATION_KIND,
  ListenTask,
  MAX_DICTATION_CHARS,
  MAX_DICTATION_ITEMS,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

import { t, type MessageKey } from '../../i18n/index.js';
import { itemsOneByOne, type StoredItem } from './items.js';
import { osaTable } from './osa.js';

// ─────────────── generating ───────────────

/** What the generator writes for a Diktat run: the entries, and where they came from. */
export const DictationDraft = z.object({
  from: z
    .enum(['list', 'topic'])
    .describe(
      'list: the entries are copied from the words or sentences the learner gave (typed or on her sheet) · topic: she named a spelling topic and you chose the words',
    ),
  lang: z
    .string()
    .regex(/^[a-z]{2}$/)
    .describe('ISO 639-1 language the entries are written and read aloud in'),
  topic: z.string().trim().min(1).max(60).nullable().describe('2–4 word topic'),
  entries: z
    .array(z.string().trim().min(1).max(MAX_DICTATION_CHARS))
    .min(1)
    .max(MAX_DICTATION_ITEMS)
    .describe('One word or one sentence each, exactly as it is to be written'),
});
export type DictationDraft = z.infer<typeof DictationDraft>;

/** The same, read forgivingly: one unusable entry costs itself, never the list. */
export const DictationDraftParsed = DictationDraft.extend({
  entries: itemsOneByOne(z.string().trim().min(1).max(MAX_DICTATION_CHARS), MAX_DICTATION_ITEMS),
});

/**
 * What the generator is told. Principles and what it must NOT do — never an example sentence,
 * which gets copied verbatim (standing owner rule).
 */
export const DICTATION_RULES = `DIKTAT ("dictation"): the app's voice reads each entry aloud and the learner TYPES it; she never sees it before she has answered. Fill "dictation" and nothing else. If the learner gave words or sentences (typed them, or they stand in SHEET TEXT), from = "list": copy up to ${MAX_DICTATION_ITEMS} of them EXACTLY as they stand there — same letters, same capitalisation, same punctuation; never correct, translate, inflect, merge or add one; leave out headings, numbering, page numbers, instructions and anything that is not a word or sentence to write. If the learner named a spelling topic instead, from = "topic": choose 8–12 common words (or short sentences, if she asked for sentences) at her level that train exactly that topic, each spelled correctly in the standard orthography of its language, nouns with their capital letter. One entry = one word or one sentence (at most ${MAX_DICTATION_CHARS} characters); no digits, no abbreviations, no symbols a voice cannot say. lang = the language of the entries.`;

/** Letters, and the punctuation a dictated sentence may carry. No digits: "12" is not spelling. */
const ENTRY_SHAPE = /^[\p{L}\p{M}][\p{L}\p{M}\s.,;:!?¿¡'’‘"„“”«»‹›()\-–—]*$/u;

/**
 * The form both strings are compared in: Unicode composed, runs of whitespace one space, and
 * the KIND of apostrophe, quotation mark and dash folded — which of them a keyboard produces is
 * not a spelling decision she made. Case, ß, umlauts and punctuation themselves stay.
 */
export function dictationForm(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/[„“”«»‹›]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether `entry` stands in `source` as written: case-sensitive, at word boundaries. */
export function standsIn(entry: string, source: string): boolean {
  const e = dictationForm(entry);
  if (e.length === 0) return false;
  const s = dictationForm(source);
  let from = 0;
  for (;;) {
    const at = s.indexOf(e, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : s[at - 1]!;
    const after = s[at + e.length] ?? '';
    if (!/[\p{L}\p{M}\p{N}]/u.test(before) && !/[\p{L}\p{M}\p{N}]/u.test(after)) return true;
    from = at + 1;
  }
}

/** A Diktat question as it is stored: an ordinary item plus the recording of its key. */
export type DictationItem = StoredItem & { listen_task: ListenTask };

/**
 * The questions of one Diktat run, or none.
 *
 * `source` is the list the words must come from — what she typed, or her sheet's text — and
 * `fromSheet` says that it is a sheet: then EVERY entry is held to it, whatever the model said
 * about where it came from. A run whose every entry falls away has no questions, and the caller
 * refuses it ("Nothing to learn from this"), never a Diktat of words that were not on her list.
 *
 * A language the voice cannot read yields nothing: a word nobody can read aloud is not a Diktat.
 */
export function dictationItems(
  draft: z.infer<typeof DictationDraftParsed> | null,
  source: { text: string; fromSheet: boolean },
  speech: { available: boolean; localeFor: (locale: string) => string | null },
  /** The app language: the line on the card is written in it. */
  locale: string,
): DictationItem[] {
  if (!draft) return [];
  if (!speech.available || speech.localeFor(draft.lang) === null) return [];
  const heldToList = source.fromSheet || draft.from === 'list';
  const seen = new Set<string>();
  const out: DictationItem[] = [];
  for (const raw of draft.entries) {
    const entry = dictationForm(raw);
    if (entry.length === 0 || entry.length > MAX_DICTATION_CHARS) continue;
    if (!ENTRY_SHAPE.test(entry)) continue;
    if (heldToList && !standsIn(entry, source.text)) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    const task = ListenTask.safeParse({ text: entry, lang: draft.lang });
    if (!task.success) continue;
    const sentence = entry.includes(' ');
    out.push({
      kind: DICTATION_KIND,
      // Written by code, never by the model: the line must not carry the word, and a line the
      // model writes could (`practice.dictation.prompt_*`).
      prompt: t(
        locale,
        sentence ? 'practice.dictation.prompt_sentence' : 'practice.dictation.prompt_word',
      ),
      answer: entry,
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: draft.topic,
      difficulty: 2,
      // The card's line is in her app language (voice mode reads it in that language); the
      // word is in `lang`, which is what the recording is read in.
      prompt_lang: locale.slice(0, 2),
      lang: draft.lang,
      figure: null,
      // No chart to read (issues #245, #246): the recording is the question.
      read: null,
      tolerance: null,
      spelling: 'strict',
      source_excerpt: null,
      curriculum_point: null,
      hints: [],
      worked_solution: null,
      rubric: null,
      listen_task: task.data,
    });
    if (out.length >= MAX_DICTATION_ITEMS) break;
  }
  return out;
}

// ─────────────── checking ───────────────

/**
 * The first place her answer differs from the key, as code reads it off the two strings. Every
 * `word` is HER word as she typed it (so the sentence never spells out the key), `before` the
 * part of her word or sentence in front of the spot.
 */
export type DictationSpot =
  | { kind: 'capital'; word: string }
  | { kind: 'lower'; word: string }
  | { kind: 'double_missing'; word: string; letter: string }
  | { kind: 'double_extra'; word: string; letter: string }
  | { kind: 'ie_missing'; word: string }
  | { kind: 'ie_extra'; word: string }
  | { kind: 'sz_needed'; word: string }
  | { kind: 'ss_needed'; word: string }
  | { kind: 'letter_missing'; word: string; before: string }
  | { kind: 'letter_extra'; word: string; letter: string }
  | { kind: 'letter_wrong'; word: string; letter: string; n: number }
  | { kind: 'swapped'; word: string }
  | { kind: 'word_wrong'; word: string }
  | { kind: 'word_missing'; before: string }
  | { kind: 'word_extra'; word: string }
  | { kind: 'together'; first: string; second: string }
  | { kind: 'apart'; word: string }
  | { kind: 'punctuation'; word: string };

export type DictationCheck = { correct: true } | { correct: false; spot: DictationSpot };

/** A token of a sentence: its letters (`core`) and the punctuation around them. */
type Token = { raw: string; core: string; lead: string; trail: string };

function tokens(text: string): Token[] {
  return dictationForm(text)
    .split(' ')
    .filter((w) => w.length > 0)
    .map((raw) => {
      const m = /^([^\p{L}\p{M}\p{N}]*)(.*?)([^\p{L}\p{M}\p{N}]*)$/u.exec(raw)!;
      return { raw, lead: m[1]!, core: m[2]!, trail: m[3]! };
    });
}

type Op<T> =
  | { op: 'same'; a: T; b: T; i: number; j: number }
  | { op: 'sub'; a: T; b: T; i: number; j: number }
  | { op: 'del'; a: T; i: number; j: number }
  | { op: 'ins'; b: T; i: number; j: number }
  | { op: 'swap'; i: number; j: number };

/**
 * The edit script from `a` (the key) to `b` (hers), first difference first, read back out of the
 * optimal-string-alignment table (`osa.ts`). Ties prefer keeping things in place (same/sub), then
 * a deletion — so "Schwimen" for "Schwimmen" reads as one m missing.
 */
function align<T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): Op<T>[] {
  const d = osaTable(a, b, eq);
  const ops: Op<T>[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    const here = d[i]![j]!;
    if (i > 0 && j > 0 && eq(a[i - 1]!, b[j - 1]!) && here === d[i - 1]![j - 1]!) {
      ops.push({ op: 'same', a: a[i - 1]!, b: b[j - 1]!, i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (
      i > 1 &&
      j > 1 &&
      eq(a[i - 1]!, b[j - 2]!) &&
      eq(a[i - 2]!, b[j - 1]!) &&
      !eq(a[i - 1]!, b[j - 1]!) &&
      here === d[i - 2]![j - 2]! + 1
    ) {
      ops.push({ op: 'swap', i: i - 2, j: j - 2 });
      i -= 2;
      j -= 2;
    } else if (i > 0 && j > 0 && here === d[i - 1]![j - 1]! + 1) {
      ops.push({ op: 'sub', a: a[i - 1]!, b: b[j - 1]!, i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (i > 0 && here === d[i - 1]![j]! + 1) {
      ops.push({ op: 'del', a: a[i - 1]!, i: i - 1, j });
      i--;
    } else {
      ops.push({ op: 'ins', b: b[j - 1]!, i, j: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}

const lower = (c: string) => c.toLocaleLowerCase();
const isUpper = (c: string) => c !== lower(c);

/**
 * The first spot in one word, `key` against `hers` (letters only, punctuation is the sentence's
 * business). Null when they are equal.
 */
function wordSpot(key: string, hers: string): DictationSpot | null {
  if (key === hers) return null;
  const k = [...key];
  const h = [...hers];
  // The same letters, another case: the one thing to say is which way.
  if (k.length === h.length && k.every((c, i) => lower(c) === lower(h[i]!))) {
    const at = k.findIndex((c, i) => c !== h[i]);
    return isUpper(k[at]!) ? { kind: 'capital', word: hers } : { kind: 'lower', word: hers };
  }
  // ß against ss, one for the other and nothing else.
  const sharp = (w: string) => w.replace(/ß/g, 'ss');
  if (sharp(key) === sharp(hers)) {
    return key.includes('ß') && !hers.includes('ß') && hers.length > key.length
      ? { kind: 'sz_needed', word: hers }
      : { kind: 'ss_needed', word: hers };
  }
  // Too far from the key to name one place: that is hearing it again, not a slip.
  const ops = align(k, h, (x, y) => x === y);
  const edits = ops.filter((o) => o.op !== 'same').length;
  if (edits > Math.max(2, Math.floor(k.length / 2))) return { kind: 'word_wrong', word: hers };
  const first = ops.find((o) => o.op !== 'same')!;
  switch (first.op) {
    case 'del': {
      const c = first.a;
      if (c === 'e' && lower(k[first.i - 1] ?? '') === 'i')
        return { kind: 'ie_missing', word: hers };
      if (k[first.i - 1] === c || k[first.i + 1] === c) {
        return { kind: 'double_missing', word: hers, letter: lower(c) };
      }
      const before = h.slice(0, first.j).join('');
      return { kind: 'letter_missing', word: hers, before };
    }
    case 'ins': {
      const c = first.b;
      if (c === 'e' && lower(h[first.j - 1] ?? '') === 'i') return { kind: 'ie_extra', word: hers };
      if (h[first.j - 1] === c || h[first.j + 1] === c) {
        return { kind: 'double_extra', word: hers, letter: lower(c) };
      }
      return { kind: 'letter_extra', word: hers, letter: c };
    }
    case 'sub': {
      if (lower(first.a) === lower(first.b)) {
        return isUpper(first.a) ? { kind: 'capital', word: hers } : { kind: 'lower', word: hers };
      }
      if (first.a === 'ß' && first.b === 's') return { kind: 'sz_needed', word: hers };
      if (first.a === 's' && first.b === 'ß') return { kind: 'ss_needed', word: hers };
      return { kind: 'letter_wrong', word: hers, letter: first.b, n: first.j + 1 };
    }
    case 'swap':
      return { kind: 'swapped', word: hers };
  }
}

/**
 * Her answer against the key: right only when it is the key, exactly (after `dictationForm`).
 * Otherwise the FIRST place it is not — first in reading order, because that is where she
 * looks first (the words before the punctuation), and one place at a time is what she can fix (the next try names the next one).
 */
export function checkDictation(key: string, typed: string): DictationCheck {
  if (dictationForm(key) === dictationForm(typed)) return { correct: true };
  const k = tokens(key);
  const h = tokens(typed);
  const ops = align(k, h, (x, y) => x.core === y.core);
  // Punctuation is named only once every word stands: a missing full stop in front of a word too
  // many is not where she should look first.
  let punctuation: DictationSpot | null = null;
  for (let n = 0; n < ops.length; n++) {
    const o = ops[n]!;
    if (o.op === 'same') {
      if (punctuation === null && (o.a.lead !== o.b.lead || o.a.trail !== o.b.trail)) {
        punctuation = { kind: 'punctuation', word: o.b.raw };
      }
      continue;
    }
    // Two of her words that are one of the key's, or the other way round: "Fahr rad", "zuhause".
    const nextOp = ops[n + 1];
    if (o.op === 'sub' && nextOp?.op === 'ins' && o.a.core === o.b.core + nextOp.b.core) {
      return { correct: false, spot: { kind: 'together', first: o.b.core, second: nextOp.b.core } };
    }
    if (o.op === 'sub' && nextOp?.op === 'del' && o.b.core === o.a.core + nextOp.a.core) {
      return { correct: false, spot: { kind: 'apart', word: o.b.core } };
    }
    if (o.op === 'ins' && nextOp?.op === 'sub' && nextOp.a.core === o.b.core + nextOp.b.core) {
      return { correct: false, spot: { kind: 'together', first: o.b.core, second: nextOp.b.core } };
    }
    if (o.op === 'del' && nextOp?.op === 'sub' && nextOp.b.core === o.a.core + nextOp.a.core) {
      return { correct: false, spot: { kind: 'apart', word: nextOp.b.core } };
    }
    if (o.op === 'del') {
      const before = h
        .slice(0, o.j)
        .map((w) => w.raw)
        .join(' ');
      return { correct: false, spot: { kind: 'word_missing', before } };
    }
    if (o.op === 'ins') return { correct: false, spot: { kind: 'word_extra', word: o.b.raw } };
    if (o.op === 'swap') {
      return { correct: false, spot: { kind: 'word_wrong', word: h[o.j]!.raw } };
    }
    const spot = wordSpot(o.a.core, o.b.core);
    if (spot) return { correct: false, spot };
  }
  if (punctuation) return { correct: false, spot: punctuation };
  // Only a difference `tokens` cannot see (nothing she could fix by looking): say it plainly.
  return { correct: false, spot: { kind: 'word_wrong', word: dictationForm(typed) } };
}

/** Whether the spot is a slip in a word she otherwise wrote — "Fast" — or more than that. */
export function nearlyRight(spot: DictationSpot): boolean {
  return spot.kind !== 'word_wrong' && spot.kind !== 'word_missing' && spot.kind !== 'word_extra';
}

const SPOT_KEY: Record<DictationSpot['kind'], MessageKey> = {
  capital: 'practice.dictation.capital',
  lower: 'practice.dictation.lower',
  double_missing: 'practice.dictation.double_missing',
  double_extra: 'practice.dictation.double_extra',
  ie_missing: 'practice.dictation.ie_missing',
  ie_extra: 'practice.dictation.ie_extra',
  sz_needed: 'practice.dictation.sz_needed',
  ss_needed: 'practice.dictation.ss_needed',
  letter_missing: 'practice.dictation.letter_missing',
  letter_extra: 'practice.dictation.letter_extra',
  letter_wrong: 'practice.dictation.letter_wrong',
  swapped: 'practice.dictation.swapped',
  word_wrong: 'practice.dictation.word_wrong',
  word_missing: 'practice.dictation.word_missing',
  word_extra: 'practice.dictation.word_extra',
  together: 'practice.dictation.together',
  apart: 'practice.dictation.apart',
  punctuation: 'practice.dictation.punctuation',
};

/** The one sentence she gets for a miss, in her app language. */
export function dictationReply(locale: string, spot: DictationSpot): string {
  if (spot.kind === 'letter_missing' && spot.before === '') {
    return t(locale, 'practice.dictation.letter_missing_start', { word: spot.word });
  }
  if (spot.kind === 'word_missing' && spot.before === '') {
    return t(locale, 'practice.dictation.word_missing_start');
  }
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(spot)) if (k !== 'kind') vars[k] = v as string | number;
  return t(locale, SPOT_KEY[spot.kind], vars);
}
