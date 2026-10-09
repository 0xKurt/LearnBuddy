import { describe, expect, it } from 'vitest';

import { LICENCES, reflow } from '../licences.js';

describe('reflow (issue #493)', () => {
  it('joins the hard breaks of a wrapped paragraph and keeps the paragraphs apart', () => {
    expect(
      reflow('Permission is hereby granted,\nfree of charge.\n\nTHE SOFTWARE IS\nPROVIDED'),
    ).toBe('Permission is hereby granted, free of charge.\n\nTHE SOFTWARE IS PROVIDED');
  });

  it('keeps list items and heading underlines on their own line', () => {
    expect(reflow('conditions:\n * one\n   more\n2. two\n(a) three')).toBe(
      'conditions:\n * one more\n2. two\n(a) three',
    );
    expect(reflow('BSD License\n===========')).toBe('BSD License\n===========');
  });
});

describe('LICENCES', () => {
  it('gives every shipped package its licence text', () => {
    expect(LICENCES.length).toBeGreaterThan(0);
    for (const entry of LICENCES) expect(entry.text.trim(), entry.name).not.toBe('');
  });
});
