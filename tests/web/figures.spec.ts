// Browser walkthrough of figures that state numbers (issues #253 and #257): angles, sides,
// forces and light drawn to scale, and structural formulas drawn from atoms and bonds. Scripted
// answers in apps/api/src/testing/scenarios/figures.ts; every verdict below is code's (a
// number, an option, a counted formula) — no tutor is scripted for any of them.
// Every question is shot at both phone sizes, light and dark (test-results/web/shots, 60-…).

import { expect, test } from '@playwright/test';

import { chosen, onboardChild, typed } from './figureWalk';
import { bothSchemes } from './fit';

test('figures to scale and structural formulas: read, answered, graded by code', async ({
  page,
}) => {
  await onboardChild(page, 'figures');
  await page.getByLabel('Schreib Buddy …').fill('Lass uns Figuren üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  const offer = 'alles zum Ablesen';
  await expect(page.getByText(offer, { exact: false })).toBeVisible();
  await page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: "Los geht's" }) })
    .filter({ hasText: offer })
    .last()
    .getByRole('button', { name: "Los geht's" })
    .click();

  // ── #257: geometry drawn to scale ──
  await expect(page.getByText('Wie groß ist der Winkel bei C?')).toBeVisible();
  // The figure says in words what it shows: the angles with their sizes and the one asked.
  await expect(page.getByRole('img', { name: /Winkel BAC: 50°/ })).toBeVisible();
  await bothSchemes(page, '60-angle-sum', 'question-figure');
  await typed(page, '70');

  await expect(page.getByText('Wie lang ist die Seite AC?')).toBeVisible();
  await bothSchemes(page, '61-pythagoras', 'question-figure');
  await typed(page, '5');

  await expect(page.getByText('Wie groß ist die resultierende Kraft?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Resultierende von P nach R/ })).toBeVisible();
  await bothSchemes(page, '62-forces', 'question-figure');
  await typed(page, '50');

  await expect(page.getByText('Unter welchem Winkel zum Lot', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Lichtstrahl von S durch M/ })).toBeVisible();
  await bothSchemes(page, '63-reflection', 'question-figure');
  await typed(page, '40');

  // ── #253: structural formulas ──
  await expect(page.getByText('Wie viele freie Elektronenpaare', { exact: false })).toBeVisible();
  // Computed, not written by the model: the lone pairs stand in the description too.
  await expect(page.getByRole('img', { name: /H₂O hat 2 freie Elektronenpaare/ })).toBeVisible();
  await bothSchemes(page, '64-lewis-water', 'question-figure');
  await chosen(page, '2');

  await expect(page.getByText('Wie heißt die markierte funktionelle Gruppe?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Markiert: OH/ })).toBeVisible();
  await bothSchemes(page, '65-structural-marked-group', 'question-figure');
  await chosen(page, 'Hydroxygruppe');

  await expect(page.getByText('Wie lautet die Summenformel dieses Moleküls?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Skelettformel/ })).toBeVisible();
  await bothSchemes(page, '66-skeletal-formula', 'question-figure');
  // Written in another order than the key: counted, so it is the same formula.
  await typed(page, 'C3H7OH');

  await expect(page.getByText('Welche Ladung hat dieses Teilchen?')).toBeVisible();
  await bothSchemes(page, '67-ammonium-charge', 'question-figure');
  await page.getByRole('button', { name: '+1', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
