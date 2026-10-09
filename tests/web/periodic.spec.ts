// Browser walkthrough of the periodic table (issue #250): the main-group table with a marked
// element, a class and a trend question, and the full table. Scripted answers in
// apps/api/src/testing/scenarios/periodic.ts; every verdict below is code's (a whole number, an
// option code wrote) — no tutor is scripted for any. Shot at both phone sizes, light and dark
// (test-results/web/shots, 96-…).

import { expect, test } from '@playwright/test';

import { chosen, onboardChild, typed } from './figureWalk';
import { bothSchemes } from './fit';

test('periodic table: read, answered, graded by code', async ({ page }) => {
  await onboardChild(page, 'periodic');
  await page.getByLabel('Schreib Buddy …').fill('Lass uns Periodensystem üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  const offer = 'wir lesen das Periodensystem';
  await expect(page.getByText(offer, { exact: false })).toBeVisible();
  await page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: "Los geht's" }) })
    .filter({ hasText: offer })
    .last()
    .getByRole('button', { name: "Los geht's" })
    .click();

  await expect(page.getByText('Wie viele Neutronen', { exact: false })).toBeVisible();
  // The figure says in words what the marked cell shows.
  await expect(
    page.getByRole('img', { name: /Markiert: Cl, Ordnungszahl 17, Atommasse 35,45 u/ }),
  ).toBeVisible();
  await bothSchemes(page, '96-periodic-neutrons', 'question-figure');
  await typed(page, '18');

  await expect(page.getByText('Valenzelektronen hat Schwefel', { exact: false })).toBeVisible();
  await typed(page, '6');

  await expect(page.getByText('Ist Silicium ein Metall', { exact: false })).toBeVisible();
  await bothSchemes(page, '97-periodic-class', 'question-figure');
  // The options are code's.
  await chosen(page, 'Halbmetall');

  await expect(page.getByText('größte Elektronegativität', { exact: false })).toBeVisible();
  await bothSchemes(page, '98-periodic-trend', 'question-figure');
  await chosen(page, 'Cl');

  await expect(page.getByText('größten Atomradius', { exact: false })).toBeVisible();
  await chosen(page, 'K');

  await expect(page.getByText('Protonen hat ein Eisenatom', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Gruppen 1 bis 18/ })).toBeVisible();
  await bothSchemes(page, '99-periodic-full', 'question-figure');
  await typed(page, '26');
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
