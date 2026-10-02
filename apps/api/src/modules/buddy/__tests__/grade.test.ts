// A suggestion, so that "In welcher Klasse bist du?" can be one tap instead of an open question
// left standing in the thread beside a start button (issue #208, point 1).
//
// What these tests pin down is as much what the number may NOT be as what it is: it is never
// stored, never stated as fact, and outside a plausible school year it is simply absent.

import { describe, expect, it } from 'vitest';

import { likelyGrade } from '../grade.js';

describe('the school year she is probably in', () => {
  it('counts from the August the running school year began', () => {
    // Born March 2014. In May 2026 the running year began in August 2025: she was 11 then.
    expect(likelyGrade('2014-03-10', '2026-05-20')).toBe(6);
    // Two months later the new year has begun and she is one year further on.
    expect(likelyGrade('2014-03-10', '2026-09-01')).toBe(7);
    // The last day before it: still the old year.
    expect(likelyGrade('2014-03-10', '2026-07-31')).toBe(6);
  });

  it('puts a child born after the cut-off a year later', () => {
    // Born in March and born in November, same year: in the same autumn they are a year apart,
    // because the November child was not six by the summer she would have started.
    expect(likelyGrade('2014-03-10', '2026-09-01')).toBe(7);
    expect(likelyGrade('2014-11-10', '2026-09-01')).toBe(6);
  });

  it('says nothing where a school year cannot be', () => {
    // Too young to be at school at all, and too old for a thirteenth year.
    expect(likelyGrade('2024-01-10', '2026-09-01')).toBeNull();
    expect(likelyGrade('1990-01-10', '2026-09-01')).toBeNull();
    expect(likelyGrade('kein Datum', '2026-09-01')).toBeNull();
  });

  it('is the same answer twice, because nothing in it is a clock or a dice', () => {
    for (let i = 0; i < 10; i++) expect(likelyGrade('2012-06-30', '2026-10-02')).toBe(9);
  });

  it('covers both edges of the cut-off on the same day', () => {
    // 30 June and 1 July, one year of schooling apart — the line the common cut-off draws.
    expect(likelyGrade('2012-06-30', '2026-10-02')).toBe(9);
    expect(likelyGrade('2012-07-01', '2026-10-02')).toBe(8);
  });
});
