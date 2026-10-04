// Browser walkthrough of tree figures (issue #256): a probability tree, a pedigree, an automaton
// and a plain search tree. Scripted answers in apps/api/src/testing/scenarios/trees.ts; every
// verdict below is code's (a fraction, an option code wrote) — no tutor is scripted for any.
// Every question is shot at both phone sizes, light and dark (test-results/web/shots, 90-…).

import { expect, test } from '@playwright/test';

import { bothRooms, chosen, onboardChild, startOffer, typed } from './figureWalk';

test('trees, pedigrees and automata: read, answered, graded by code', async ({ page }) => {
  await onboardChild(page, 'trees');
  await startOffer(page, 'Lass uns Bäume üben', 'Bäume zum Rechnen');

  await expect(page.getByText('zweimal Rot zu ziehen', { exact: false })).toBeVisible();
  // The figure says in words what it shows: every branch with its probability.
  await expect(page.getByRole('img', { name: /Ast von Start zu rot: 3\/5/ })).toBeVisible();
  await bothRooms(page, '90-tree-path');
  await typed(page, '3/10');

  await expect(page.getByText('Ast mit dem Fragezeichen', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Fragezeichen/ })).toBeVisible();
  await bothRooms(page, '91-tree-edge');
  await typed(page, '1/4');

  await expect(page.getByText('Welcher Erbgang liegt', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Person 6, Frau, Generation III, betroffen/ }),
  ).toBeVisible();
  await bothRooms(page, '92-pedigree-mode');
  // The options are code's, not the model's ("X-rezessiv").
  await chosen(page, 'autosomal-rezessiv');

  await expect(page.getByText('Welchen Genotyp hat Person 4?')).toBeVisible();
  await bothRooms(page, '93-pedigree-genotype');
  // The genotype option is read with its case as words (#352).
  await page.getByRole('button', { name: 'groß A, klein a', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('Wird das Wort 1010', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Übergang von q0 nach q1 mit 1/ })).toBeVisible();
  await bothRooms(page, '94-automaton');
  await chosen(page, 'Ja, es wird akzeptiert');

  await expect(page.getByText('Wurzel dieses Suchbaums', { exact: false })).toBeVisible();
  await bothRooms(page, '95-search-tree');
  await typed(page, '8');
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
