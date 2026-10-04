// Browser walkthrough of the periodic table (issue #250): the main-group table with a marked
// element, a class and a trend question, and the full table. Scripted answers in
// apps/api/src/testing/scenarios/periodic.ts; every verdict below is code's (a whole number, an
// option code wrote) — no tutor is scripted for any. Shot at both phone sizes, light and dark
// (test-results/web/shots, 96-…).

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`periodic-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
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

async function chosen(page: Page, option: string): Promise<void> {
  await page.getByRole('button', { name: option, exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
}

test('periodic table: read, answered, graded by code', async ({ page }) => {
  await onboardChild(page);
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
  await bothRooms(page, '96-periodic-neutrons');
  await typed(page, '18');

  await expect(page.getByText('Valenzelektronen hat Schwefel', { exact: false })).toBeVisible();
  await typed(page, '6');

  await expect(page.getByText('Ist Silicium ein Metall', { exact: false })).toBeVisible();
  await bothRooms(page, '97-periodic-class');
  // The options are code's.
  await chosen(page, 'Halbmetall');

  await expect(page.getByText('größte Elektronegativität', { exact: false })).toBeVisible();
  await bothRooms(page, '98-periodic-trend');
  await chosen(page, 'Cl');

  await expect(page.getByText('größten Atomradius', { exact: false })).toBeVisible();
  await chosen(page, 'K');

  await expect(page.getByText('Protonen hat ein Eisenatom', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Gruppen 1 bis 18/ })).toBeVisible();
  await bothRooms(page, '99-periodic-full');
  await typed(page, '26');
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
