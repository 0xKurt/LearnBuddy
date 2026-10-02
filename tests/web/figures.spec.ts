// Browser walkthrough of figures that state numbers (issues #253 and #257): angles, sides,
// forces and light drawn to scale, and structural formulas drawn from atoms and bonds. Scripted
// answers in apps/api/src/testing/scenarios/figures.ts; every verdict below is code's (a
// number, an option, a counted formula) — no tutor is scripted for any of them.
// Every question is shot at both phone sizes, light and dark (test-results/web/shots, 60-…).

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`figures-${Date.now()}@example.test`);
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

test('figures to scale and structural formulas: read, answered, graded by code', async ({
  page,
}) => {
  await onboardChild(page);
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
  await bothRooms(page, '60-angle-sum');
  await typed(page, '70');

  await expect(page.getByText('Wie lang ist die Seite AC?')).toBeVisible();
  await bothRooms(page, '61-pythagoras');
  await typed(page, '5');

  await expect(page.getByText('Wie groß ist die resultierende Kraft?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Resultierende von P nach R/ })).toBeVisible();
  await bothRooms(page, '62-forces');
  await typed(page, '50');

  await expect(page.getByText('Unter welchem Winkel zum Lot', { exact: false })).toBeVisible();
  await expect(page.getByRole('img', { name: /Lichtstrahl von S durch M/ })).toBeVisible();
  await bothRooms(page, '63-reflection');
  await typed(page, '40');

  // ── #253: structural formulas ──
  await expect(page.getByText('Wie viele freie Elektronenpaare', { exact: false })).toBeVisible();
  // Computed, not written by the model: the lone pairs stand in the description too.
  await expect(page.getByRole('img', { name: /H₂O hat 2 freie Elektronenpaare/ })).toBeVisible();
  await bothRooms(page, '64-lewis-water');
  await chosen(page, '2');

  await expect(page.getByText('Wie heißt die markierte funktionelle Gruppe?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Markiert: OH/ })).toBeVisible();
  await bothRooms(page, '65-structural-marked-group');
  await chosen(page, 'Hydroxygruppe');

  await expect(page.getByText('Wie lautet die Summenformel dieses Moleküls?')).toBeVisible();
  await expect(page.getByRole('img', { name: /Skelettformel/ })).toBeVisible();
  await bothRooms(page, '66-skeletal-formula');
  // Written in another order than the key: counted, so it is the same formula.
  await typed(page, 'C3H7OH');

  await expect(page.getByText('Welche Ladung hat dieses Teilchen?')).toBeVisible();
  await bothRooms(page, '67-ammonium-charge');
  await page.getByRole('button', { name: '+1', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
