import { expect, it } from 'vitest';
import { fuseRrf } from '../material.js';
const lexical = [{ materialId: 'lexical', passage: 'weak lexical match' }];
const vectors = (first: number, second: number) => [
  { materialId: 'semantic', passage: 'semantic match', vectorDist: first },
  { materialId: 'lexical', passage: 'weak lexical match', vectorDist: second },
];
it('puts calibrated, clearly separated semantic evidence ahead of weak duplicate lexical votes', () => {
  expect(fuseRrf(lexical, lexical, vectors(0.4, 0.55), 'openai-small-1536')[0]?.materialId).toBe(
    'semantic',
  );
});
it.each([
  [0.4, 0.42],
  [0.7, 0.8],
])('keeps lexical ranking when distances %s and %s are ambiguous or unrelated', (first, second) => {
  expect(
    fuseRrf(lexical, lexical, vectors(first, second), 'openai-small-1536')[0]?.materialId,
  ).toBe('lexical');
});
it('keeps the existing fusion without a calibrated space or vector list', () => {
  expect(fuseRrf(lexical, lexical, vectors(0.4, 0.55))[0]?.materialId).toBe('lexical');
  expect(fuseRrf(lexical, lexical, [], 'openai-small-1536')[0]?.materialId).toBe('lexical');
});
