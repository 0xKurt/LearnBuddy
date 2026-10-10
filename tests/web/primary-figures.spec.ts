// Browser walkthrough of the primary-school figures (issue #254): a clock to read, two clocks for
// a span, coins and notes, a Zwanzigerfeld, base-ten blocks and clocks as the options of a
// multiple choice. Scripted answers in apps/api/src/testing/scenarios/primary.ts; every verdict
// below is code's (a time, a number, an option) — no tutor is scripted for any of them.
// Every question is shot at both phone sizes, light and dark (test-results/web/shots, 90-…).

import { expect, test, type Page } from '@playwright/test';

import { typed } from './figureWalk';
import { bothSchemes } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`primary-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Mia');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2018');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: 'Weiter' }).click();
  // Notifications are asked of the adults right after their PIN (issue #518).
  await page.getByRole('button', { name: 'Nein, danke' }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Mia!" }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

test('primary-school figures: read, answered, graded by code', async ({ page }) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Lass uns Uhr und Geld üben');
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

  await expect(page.getByText('Wie spät ist es?')).toBeVisible();
  // The description says where the hands stand, never the time they make.
  await expect(
    page.getByRole('img', { name: /kleine Zeiger zwischen 7 und 8, der große Zeiger auf der 9/ }),
  ).toBeVisible();
  await bothSchemes(page, '90-clock', 'question-figure');
  // The evening reading of the same hands, in the German notation: right, by code.
  await typed(page, '19.45');

  await expect(page.getByText('Wie viele Minuten vergehen', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Zwei Uhren/ })).toBeVisible();
  await bothSchemes(page, '91-clock-span', 'question-figure');
  await typed(page, '45');

  await expect(page.getByText('Wie viel Geld ist das?')).toBeVisible();
  await expect(page.getByRole('img', { name: /1 Schein zu 5 Euro/ })).toBeVisible();
  await bothSchemes(page, '92-money', 'question-figure');
  // The amount in cents is the amount.
  await typed(page, '845 ct');

  await expect(page.getByText('Wie viele Plättchen sind es zusammen?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Zwanzigerfeld/ })).toBeVisible();
  await bothSchemes(page, '93-twenty-frame', 'question-figure');
  await typed(page, '14');

  await expect(page.getByText('Wie viele Punkte sind gefärbt?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Hunderterfeld/ })).toBeVisible();
  await bothSchemes(page, '93b-hundred-frame', 'question-figure');
  await typed(page, '37');

  await expect(page.getByText('Welche Zahl ist das?')).toBeVisible();
  await expect(
    page.getByRole('img', { name: /2 Hunderterplatten, 3 Zehnerstangen/ }),
  ).toBeVisible();
  await bothSchemes(page, '94-base-ten', 'question-figure');
  await typed(page, '234');

  await expect(page.getByText('Welche Uhr zeigt halb drei?')).toBeVisible();
  const option = (letter: string) =>
    page.getByRole('button', { name: new RegExp(`^${letter}: Uhr`) });
  for (const letter of ['A', 'B', 'C', 'D']) await expect(option(letter)).toBeVisible();
  await bothSchemes(page, '95-clock-choices');
  await option('A').click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
