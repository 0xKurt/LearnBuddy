// Browser walkthrough of the primary-school figures (issue #254): a clock to read, two clocks for
// a span, coins and notes, a Zwanzigerfeld, base-ten blocks and clocks as the options of a
// multiple choice. Scripted answers in apps/api/src/testing/scenarios/primary.ts; every verdict
// below is code's (a time, a number, an option) — no tutor is scripted for any of them.
// Every question is shot at both phone sizes, light and dark (test-results/web/shots, 90-…).

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

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
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Mia!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/** The question with its figure, at both phone sizes, in the light and the dark room. */
async function bothRooms(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('question-figure')).toBeVisible();
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-dark`);
  await page.emulateMedia({ colorScheme: 'light' });
}

async function typed(page: Page, text: string): Promise<void> {
  // Right after the switch back from the dark room the field can render once more; fill until
  // the value holds instead of typing into the copy that is about to go.
  const field = page.getByLabel('Deine Antwort');
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1000 });
  }).toPass();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
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
  await bothRooms(page, '90-clock');
  // The evening reading of the same hands, in the German notation: right, by code.
  await typed(page, '19.45');

  await expect(page.getByText('Wie viele Minuten vergehen', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Zwei Uhren/ })).toBeVisible();
  await bothRooms(page, '91-clock-span');
  await typed(page, '45');

  await expect(page.getByText('Wie viel Geld ist das?')).toBeVisible();
  await expect(page.getByRole('img', { name: /1 Schein zu 5 Euro/ })).toBeVisible();
  await bothRooms(page, '92-money');
  // The amount in cents is the amount.
  await typed(page, '845 ct');

  await expect(page.getByText('Wie viele Plättchen sind es zusammen?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Zwanzigerfeld/ })).toBeVisible();
  await bothRooms(page, '93-twenty-frame');
  await typed(page, '14');

  await expect(page.getByText('Wie viele Punkte sind gefärbt?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Hunderterfeld/ })).toBeVisible();
  await bothRooms(page, '93b-hundred-frame');
  await typed(page, '37');

  await expect(page.getByText('Welche Zahl ist das?')).toBeVisible();
  await expect(
    page.getByRole('img', { name: /2 Hunderterplatten, 3 Zehnerstangen/ }),
  ).toBeVisible();
  await bothRooms(page, '94-base-ten');
  await typed(page, '234');

  await expect(page.getByText('Welche Uhr zeigt halb drei?')).toBeVisible();
  const option = (letter: string) =>
    page.getByRole('button', { name: new RegExp(`^${letter}: Uhr`) });
  for (const letter of ['A', 'B', 'C', 'D']) await expect(option(letter)).toBeVisible();
  await shot(page, '95-clock-choices');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '95-clock-choices-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await option('A').click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
