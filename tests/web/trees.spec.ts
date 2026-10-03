// Browser walkthrough of tree figures (issue #256): a probability tree, a pedigree, an automaton
// and a plain search tree. Scripted answers in apps/api/src/testing/scenarios/trees.ts; every
// verdict below is code's (a fraction, an option code wrote) — no tutor is scripted for any.
// Every question is shot at both phone sizes, light and dark (test-results/web/shots, 90-…).

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`trees-${Date.now()}@example.test`);
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

test('trees, pedigrees and automata: read, answered, graded by code', async ({ page }) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Lass uns Bäume üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  const offer = 'Bäume zum Rechnen';
  await expect(page.getByText(offer, { exact: false })).toBeVisible();
  await page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: "Los geht's" }) })
    .filter({ hasText: offer })
    .last()
    .getByRole('button', { name: "Los geht's" })
    .click();

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
  await page.getByRole('button', { name: /^A\s*a$/ }).click();
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
