// Years, dates and clock times read as what they are (issue #227, finding 8).
//
// Until now "15.07.1789" against a key of 14.07.1789, and "1788" inside a sentence against a key
// of 1789, reached the tutor as "not decidable by rules" — and on that it may say anything,
// including "wrong" about a right answer and "right" about a wrong one. Code can read all three.
//
// The three cases are deliberately NOT the same, and the difference is the whole point:
//
//   - A DATE has one reading. Two dots around a one- or two-digit month and a four-digit year
//     are a date and nothing else, so a different day is certainly a different date — and
//     "14.7.1789" for "14.07.1789" is the same date written shorter, which is a question of
//     FORM, never of value (decision D-3, issue #227 finding 1).
//   - A CLOCK TIME: "14.30" is how German writes "14:30", the same time — the dot and the
//     colon are interchangeable in one reading only, and a two-digit minute below 60 behind an
//     hour below 24 is that reading. A DIFFERENT answer is harder, because "14:30" is also a
//     ratio and a division the way German schools write it, and which one is meant is not in
//     the characters (issue #175). That ambiguity is not resolved here — it is not needed:
//     "14:50" is wrong only when it is wrong in EVERY reading at once (another time even on a
//     twelve-hour clock, another ratio, another quotient, and for a dot also another decimal
//     and another product). Where any one reading agrees ("7:15" is 14:30 as a ratio, "2:30"
//     is 14:30 on a twelve-hour clock, "14.50" is 14:30 in decimal hours, "0.40" is 12:30 as
//     a division), nothing is decided.
//   - A YEAR inside a sentence is read only when the sentence states exactly ONE four-digit
//     number and the key is one too. Four digits is the gate because that is what a year looks
//     like: a one- to three-digit number in a sentence is far more often something incidental
//     ("das 18. Jahrhundert", "in 3 Schritten"), and two numbers in one sentence mean code
//     cannot know which one answers the question. A number pulled out of a sentence on a guess
//     is what had to be reverted in finding 4 of the same issue; this one takes the sentence
//     apart only where there is nothing to guess.
//
// No word lists: no month names, no "Uhr", nothing about the language of the sentence
// (CLAUDE.md rule 3). Only digits, separators and how many of them there are.

/** A key that is nothing but a four-digit number — a year, or a count written like one. */
export function isYear(key: string): boolean {
  return /^\s*\d{4}\s*$/.test(key);
}

/**
 * Four digits that are a number of their own: not the tail of a longer number ("12345"), not the
 * fraction part behind a separator ("1.000", "1789,5"), not the year inside a date ("14.07.1789"
 * — that is read as a date, not as a year), and not one end of a span, a fraction or a ratio
 * ("1788/89", "1788-89", "1500:3"), where the number stands for something else than itself.
 */
const FOUR_DIGITS = /(?<![\d.,/:–-])\d{4}(?![.,/:–-]?\d)/g;

/**
 * The one four-digit number a sentence states, or null. Null as soon as there is more than one
 * (code cannot know which answers the question) and for a text without a letter in it — a bare
 * number is not a number inside a sentence, and the numeric rules own it, where homework may
 * still read it as a step towards the answer.
 */
export function yearIn(text: string): string | null {
  if (!/\p{L}/u.test(text)) return null;
  const found = [...text.matchAll(FOUR_DIGITS)].map((m) => m[0]);
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** A date as day.month.year, in the one notation that cannot be read as anything else. */
const DATE = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/;

function asDate(s: string): string | null {
  const m = DATE.exec(s.trim());
  if (m === null) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // A month past 12 or a day past 31 is not a date, whatever else it may be.
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${month}-${day}`;
}

/**
 * Two dates: the same day, or certainly a different one. Null when either side is not a date in
 * this notation — a month written as a word, an ISO date or a date inside a sentence is for the
 * tutor, because reading those needs a word list or a guess about which of several numbers is
 * meant.
 */
export function sameDate(key: string, answer: string): 'same' | 'different' | null {
  const k = asDate(key);
  const a = asDate(answer);
  if (k === null || a === null) return null;
  return k === a ? 'same' : 'different';
}

/** The key's notation for a time: a colon, an hour below 24, two minute digits below 60. */
const CLOCK_KEY = /^(\d{1,2}):([0-5]\d)$/;
/** The learner's: the same, or with the dot German writes a time with. */
const CLOCK_ANSWER = /^(\d{1,2})([.:])([0-5]\d)$/;

/**
 * A clock-time key against an answer written like one. 'same' when the answer states the key's
 * time with only the separator changed ("14.30" for "14:30"); 'different' only when it differs
 * in every reading the characters allow (see the header, issue #175); null for everything else
 * — a key or an answer in another notation, or an answer some reading still agrees with.
 */
export function clockTime(key: string, answer: string): 'same' | 'different' | null {
  const k = CLOCK_KEY.exec(key.trim());
  const a = CLOCK_ANSWER.exec(answer.trim());
  if (k === null || a === null) return null;
  const [kh, km] = [Number(k[1]), Number(k[2])];
  const [ah, dot, am] = [Number(a[1]), a[2] === '.', Number(a[3])];
  if (kh > 23) return null;
  if (kh === ah && km === am) return 'same';
  const agrees = [
    // A time, on a 24- or a 12-hour clock: 2:30 may be what 14:30 is in the afternoon.
    kh % 12 === ah % 12 && km === am,
    // A ratio or a division, the key's way and the answer's way (cross-multiplied, exact).
    kh * am === ah * km,
    // With a dot, the answer may also be a decimal: hours (14.50 h is 14:30), or a number to
    // set against the key read as a division — and a dot is a product too (14·50).
    dot && (ah * 100 + am) * 60 === (kh * 60 + km) * 100,
    dot && (ah * 100 + am) * km === 100 * kh,
    dot && ah * am * km === kh,
  ];
  return agrees.some(Boolean) ? null : 'different';
}
