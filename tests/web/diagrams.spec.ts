// Browser walkthrough of diagrams (issue #247): a Wasserkreislauf with two gaps, a Nahrungskette
// as a word bank, the Gewaltenteilung as a tree and a Regelkreis on a grid. Scripted answers in
// apps/api/src/testing/scenarios/diagrams.ts; every verdict below is code's (the key, an
// option) — no tutor is scripted for any. Every question is shot at both phone sizes, light and
// dark (test-results/web/shots, 74-…).

import { expect, test } from '@playwright/test';

import { bothRooms, chosen, onboardChild, startOffer, typed } from './figureWalk';

test('diagrams: gaps in boxes with arrows, answered, graded by code', async ({ page }) => {
  await onboardChild(page, 'diagrams');
  await startOffer(page, 'Lass uns Schemata üben', 'Schemata mit Lücken');

  await expect(page.getByText('Wasserkreislauf in Lücke A', { exact: false })).toBeVisible();
  // The figure says in words what it shows: the ring, every arrow, a gap by its letter.
  await expect(
    page.getByRole('img', { name: /Kreislauf mit 4 Kästchen.*Pfeil von Verdunstung nach Lücke A/ }),
  ).toBeVisible();
  await bothRooms(page, '74-diagram-cycle');
  await typed(page, 'Kondensation');

  await expect(page.getByText('Wasserkreislauf in Lücke B', { exact: false })).toBeVisible();
  await typed(page, 'Versickerung');

  await expect(page.getByText('Lücke A der Nahrungskette', { exact: false })).toBeVisible();
  await bothRooms(page, '75-diagram-chain');
  await chosen(page, 'Hase');

  await expect(page.getByText('Welche Gewalt fehlt', { exact: false })).toBeVisible();
  await bothRooms(page, '76-diagram-tree');
  await chosen(page, 'Exekutive');

  await expect(page.getByText('Regelkreis in Lücke A', { exact: false })).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Pfeil von Messfühler nach Regler: Istwert/ }),
  ).toBeVisible();
  await bothRooms(page, '77-diagram-grid');
  await typed(page, 'Stellglied');
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
