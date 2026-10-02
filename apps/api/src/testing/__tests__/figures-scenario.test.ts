// The walkthrough's figures (tests/web/figures.spec.ts) must be ones the server keeps: a
// scenario that the checks of issues #253/#257 drop would show the learner an empty run.

import { describe, expect, it } from 'vitest';

import { ItemDraft, usableItems } from '../../modules/practice/items.js';
import { FIGURE_ITEMS } from '../scenarios/figures.js';

describe('the figures walkthrough scenario', () => {
  it('passes every check the server applies to what the model writes', () => {
    const drafts = FIGURE_ITEMS.map((i) => ItemDraft.parse(i));
    // Nothing fell back to "no figure" in parsing, and nothing was dropped.
    expect(drafts.every((d) => d.figure !== null)).toBe(true);
    expect(usableItems(drafts).map((i) => i.prompt)).toEqual(FIGURE_ITEMS.map((i) => i.prompt));
  });
});
