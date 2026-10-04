// Years, dates and clock times (issue #227, finding 8). What matters here is where the module
// says NOTHING: a number pulled out of a sentence on a guess is what had to be reverted in
// finding 4 of the same issue, and a clock time told apart from a ratio by its characters is
// what issue #175 closed on.

import { describe, expect, it } from 'vitest';

import { clockTime, isYear, sameDate, yearIn } from '../dates.js';

describe('a key that is a year', () => {
  it('is four digits and nothing else', () => {
    expect(isYear('1789')).toBe(true);
    expect(isYear(' 1789 ')).toBe(true);
    expect(isYear('14.07.1789')).toBe(false);
    expect(isYear('789')).toBe(false);
    expect(isYear('17890')).toBe(false);
    expect(isYear('1789 n. Chr.')).toBe(false);
  });
});

describe('the one four-digit number a sentence states', () => {
  it('reads it wherever it stands in the sentence', () => {
    expect(yearIn('Die Französische Revolution begann 1788.')).toBe('1788');
    expect(yearIn('1788 begann die Revolution')).toBe('1788');
    expect(yearIn('Im 18. Jahrhundert, nämlich 1789')).toBe('1789');
    expect(yearIn('etwa im Jahr 1789 n. Chr.')).toBe('1789');
  });

  it('says nothing as soon as it would have to guess', () => {
    // Two of them: which one answers the question is not in the characters.
    expect(yearIn('Die Revolution begann 1789 und endete 1799.')).toBeNull();
    // No four-digit number at all.
    expect(yearIn('Ende des 18. Jahrhunderts')).toBeNull();
    // Part of a longer number, or behind a separator: not a number of its own.
    expect(yearIn('Es kamen 1.000 Menschen')).toBeNull();
    expect(yearIn('Es waren 12345 Menschen')).toBeNull();
    expect(yearIn('etwa 1789,5 Jahre')).toBeNull();
    // A date is read as a date, not as the year inside it.
    expect(yearIn('Am 14.07.1789')).toBeNull();
    // One end of a span, a fraction or a ratio stands for more than itself: "1788/89" names two
    // years, and reading only the first would call a half-right answer plainly wrong.
    expect(yearIn('Die Jahre 1788/89')).toBeNull();
    expect(yearIn('1788-89')).toBeNull();
    expect(yearIn('Das Verhältnis 1500:3')).toBeNull();
    // A dash with spaces around it is punctuation, not part of the number.
    expect(yearIn('1789 – ein Umbruch')).toBe('1789');
    // A bare number is not a number inside a sentence: the numeric rules own it, and in
    // homework they may still read it as a step towards the answer.
    expect(yearIn('1788')).toBeNull();
    expect(yearIn(' 1788 ')).toBeNull();
  });
});

describe('two dates', () => {
  it('tells a different day from the same day written shorter', () => {
    expect(sameDate('14.07.1789', '15.07.1789')).toBe('different');
    expect(sameDate('14.07.1789', '14.08.1789')).toBe('different');
    expect(sameDate('14.07.1789', '14.07.1788')).toBe('different');
    expect(sameDate('14.07.1789', '14.7.1789')).toBe('same');
    expect(sameDate('1.1.2026', '01.01.2026')).toBe('same');
  });

  it('says nothing about a notation it cannot read without a word list or a guess', () => {
    expect(sameDate('14.07.1789', '14. Juli 1789')).toBeNull();
    expect(sameDate('14.07.1789', '1789-07-14')).toBeNull();
    expect(sameDate('14.07.1789', 'Am 14.07.1789 fiel die Bastille')).toBeNull();
    // Not a date: a month past twelve, a day past 31, a two-digit year.
    expect(sameDate('14.13.1789', '14.13.1789')).toBeNull();
    expect(sameDate('32.07.1789', '32.07.1789')).toBeNull();
    expect(sameDate('14.07.89', '14.07.89')).toBeNull();
  });
});

describe('a clock time', () => {
  it('is the same time when only the separator differs', () => {
    expect(clockTime('14:30', '14.30')).toBe('same');
    expect(clockTime('14:30', '14:30')).toBe('same');
    expect(clockTime('9:05', '9.05')).toBe('same');
    expect(clockTime('9:05', '09.05')).toBe('same');
  });

  it('is a different time only when every reading of the characters disagrees (#175)', () => {
    // Another time, another ratio, another quotient, another decimal, another product.
    expect(clockTime('14:30', '14:50')).toBe('different');
    expect(clockTime('14:30', '15.30')).toBe('different');
    expect(clockTime('9:05', '9:15')).toBe('different');
  });

  it('decides nothing where one reading still agrees', () => {
    // 14:30 on a twelve-hour clock.
    expect(clockTime('14:30', '2.30')).toBeNull();
    expect(clockTime('14:30', '02:30')).toBeNull();
    // The same ratio, reduced.
    expect(clockTime('14:30', '7:15')).toBeNull();
    // 14.50 hours is 14:30.
    expect(clockTime('14:30', '14.50')).toBeNull();
    // 12:30 as a division is 0.40.
    expect(clockTime('12:30', '0.40')).toBeNull();
    // A full hour: as a division the key has no value, so nothing compares against it.
    expect(clockTime('14:00', '7:00')).toBeNull();
  });

  it('reads only the colon key and a time-shaped answer', () => {
    // Not a time: an hour past 23, minutes past 59, a single minute digit (that is a division
    // the way German schools write it), anything with a word in it.
    expect(clockTime('25:30', '25.30')).toBeNull();
    expect(clockTime('14:60', '14.60')).toBeNull();
    expect(clockTime('3:4', '3.4')).toBeNull();
    expect(clockTime('14:35 Uhr', '14.35 Uhr')).toBeNull();
    expect(clockTime('14:30', 'halb drei')).toBeNull();
    // The key's notation is the colon: a key written with a dot is a number, and reading it as
    // a time would be the guess this module refuses.
    expect(clockTime('14.30', '14:30')).toBeNull();
  });
});
