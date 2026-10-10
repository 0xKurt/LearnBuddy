// What a rehearsal talk or a read-aloud is MEASURED by — code only (issue #264, rule 0;
// docs/architecture.md §Talks and reading aloud).
//
// The model writes down what was said, nothing more. Everything a number stands on is counted
// here from that transcript and from the recorder's own clock:
//
//   · words and words per minute — a word is a run of letters or digits;
//   · filler sounds — the transcript marks every hesitation sound in curly braces ("{äh}"), a
//     transcription convention like punctuation, so code COUNTS them and never decides what one
//     is from a list of words (CLAUDE.md rule 3);
//   · skipped and misread words — the text she was given is aligned word by word with what she
//     said (an edit distance over words), so a word of the text with no partner was skipped and
//     one paired with a different word was read as something else. The text is never shown to the
//     transcriber, so it cannot "hear" the text instead of her;
//   · a part of a talk counts as heard only with a quote that really stands in the transcript
//     (the rubric rule of #211): a model cannot confirm what she did not say.
//
// No stored audio and no stored transcript depend on any of this: the numbers are what is kept.

import type { TalkPart, TalkPartView } from '@learnbuddy/shared-types/contracts';

/** A hesitation sound as the transcript marks it: "{äh}", "{ähm}", "{uh}". */
const FILLER = /\{[^{}\n]{1,16}\}/g;

/** How many hesitation sounds the transcript marks. */
export function countFillers(transcript: string): number {
  return (transcript.match(FILLER) ?? []).length;
}

/** The words of a text as written (punctuation around them dropped), fillers left out. */
export function wordsOf(text: string): string[] {
  return text
    .replace(FILLER, ' ')
    .normalize('NFC')
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/** A word as compared: lower case, inner punctuation (apostrophes, hyphens) gone. */
function fold(word: string): string {
  return word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

const isNumber = (w: string) => /^\p{N}+([.,]\p{N}+)?$/u.test(w);

/** Words per minute over the recorder's duration, rounded; 0 for nothing said. */
export function wordsPerMinute(words: number, durationMs: number): number {
  if (words <= 0 || durationMs <= 0) return 0;
  return Math.round(words / (durationMs / 60_000));
}

export type ReadingComparison = {
  /** Words of the text read as written. */
  correct: number;
  /** Words of the text she left out, in text order. */
  skipped: string[];
  /** Words of the text she read as another word, in text order. */
  misread: string[];
};

/**
 * The text aligned with what she said, word by word (Levenshtein over words, ties preferring a
 * match, then a substitution). A number in the text matches whatever single word she said in its
 * place: "1990" may be transcribed in words, and how a year is spoken is not a reading error.
 */
export function compareReading(text: string, transcript: string): ReadingComparison {
  const want = wordsOf(text);
  const heard = wordsOf(transcript);
  const a = want.map(fold);
  const b = heard.map(fold);
  const n = a.length;
  const m = b.length;
  const same = (i: number, j: number) => a[i] === b[j] || isNumber(want[i]!);
  // cost[i][j]: aligning the first i words of the text with the first j words heard.
  const cost: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cost[i]![j] = Math.min(
        cost[i - 1]![j - 1]! + (same(i - 1, j - 1) ? 0 : 1),
        cost[i - 1]![j]! + 1,
        cost[i]![j - 1]! + 1,
      );
    }
  }
  const skipped: string[] = [];
  const misread: string[] = [];
  let correct = 0;
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const here = cost[i]![j]!;
    if (i > 0 && j > 0 && same(i - 1, j - 1) && here === cost[i - 1]![j - 1]!) {
      correct++;
      i--;
      j--;
    } else if (i > 0 && j > 0 && here === cost[i - 1]![j - 1]! + 1) {
      misread.push(want[i - 1]!);
      i--;
      j--;
    } else if (i > 0 && here === cost[i - 1]![j]! + 1) {
      skipped.push(want[i - 1]!);
      i--;
    } else {
      // A word she added (a repetition, a self-correction): not an error of the text.
      j--;
    }
  }
  return { correct, skipped: skipped.reverse(), misread: misread.reverse() };
}

/** Does the quote stand in the transcript (case, punctuation and fillers aside)? */
export function quoteInTranscript(quote: string, transcript: string): boolean {
  const q = wordsOf(quote).map(fold).join(' ');
  if (q === '') return false;
  const t = ` ${wordsOf(transcript).map(fold).join(' ')} `;
  return t.includes(` ${q} `);
}

export type PartJudgement = { part: TalkPart; present: boolean; quote: string | null };

/**
 * The parts of a talk as they stand (issue #264 with the rubric rule of #211): heard only when
 * the model quoted it and the quote is found in the transcript; not_heard when the model said it
 * is missing; unknown when the model said nothing usable about it — never "missing" by default.
 */
export function talkStructure(
  judged: readonly PartJudgement[],
  transcript: string,
): TalkPartView[] {
  const parts: TalkPart[] = ['opening', 'main', 'closing'];
  return parts.map((part) => {
    const j = judged.find((x) => x.part === part);
    if (!j) return { part, status: 'unknown' };
    if (!j.present) return { part, status: 'not_heard' };
    return {
      part,
      status: j.quote && quoteInTranscript(j.quote, transcript) ? 'heard' : 'unknown',
    };
  });
}
