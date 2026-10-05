// Browser walkthrough of the two sources besides a worksheet (issue #259): a corrected test
// becomes NEW tasks for exactly what the teacher marked — the marked task itself, the task that
// was right and the grade are nowhere — and the notebook entry of a lesson becomes five short
// questions. The sheet's own screen says where its questions came from, once, quietly. Scripted
// answers in apps/api/src/testing/scenarios/sources.ts; every cut is code's. Shot at both phone
// sizes, light and dark (test-results/web/shots, 120-…).

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { openMenu } from './coreLoop';
import { shot } from './fit';

const FIXTURES = join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures');

/** A child of the given birth year (14 or 15 today: the age her scripted reading is keyed by). */
async function onboardChild(page: Page, name: string, year: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`sources-${year}-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill(name);
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Bayern' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('03');
  await page.getByLabel('Monat', { exact: true }).fill('03');
  await page.getByLabel('Jahr', { exact: true }).fill(year);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: `Los geht's, ${name}!` }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/** One photo attached in the chat and sent; its reading is done once the practice is ready. */
async function sendPhoto(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Was möchtest du anhängen?' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Aus der Galerie' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'sharp.jpg'));
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByRole('button', { name: 'Jetzt üben' })).toBeVisible({ timeout: 30_000 });
}

/** The sheet's own screen, through "Dein Material" and its subject. */
async function openSheet(page: Page, subject: string, title: string): Promise<void> {
  await openMenu(page, 'Dein Material');
  await page.getByRole('button', { name: new RegExp(`^${subject}: `) }).click();
  await page.getByRole('button', { name: `Fragen aus „${title}“ ansehen` }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

/** This state at both phone sizes, in the light and the dark room. */
async function bothRooms(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-dark`);
  await page.emulateMedia({ colorScheme: 'light' });
}

test('a corrected test: new tasks for what was marked, nothing else, no grade', async ({
  page,
}) => {
  await onboardChild(page, 'Mara', '2012');
  await sendPhoto(page);
  await openSheet(page, 'Mathe', 'Probe Rechnen');
  await expect(page.getByText('Aus deiner korrigierten Arbeit:', { exact: false })).toBeVisible();
  // The two new tasks; the marked task itself and the one that was right are not there.
  await expect(page.getByText('26 + 59')).toBeVisible();
  await expect(page.getByText('6 · 9')).toBeVisible();
  await expect(page.getByText('37 + 48')).toHaveCount(0);
  await expect(page.getByText('2 + 2')).toHaveCount(0);
  await expect(page.getByText(/Note 3|14\/20/)).toHaveCount(0);
  await bothRooms(page, '120-sources-corrected-test');
});

test('a notebook entry: five short questions for the next morning', async ({ page }) => {
  await onboardChild(page, 'Jonas', '2011');
  await sendPhoto(page);
  await openSheet(page, 'Biologie', 'Die Photosynthese');
  await expect(page.getByText('Aus deinem Hefteintrag:', { exact: false })).toBeVisible();
  await expect(page.getByText(/^Biologie · 5 Aufgaben$/)).toBeVisible();
  await bothRooms(page, '121-sources-notebook-entry');
});
