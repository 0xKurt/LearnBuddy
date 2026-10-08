// The steps every figure walkthrough shares (trees #256, solids #255, diagrams #247): a parent
// signs up her child, Buddy offers a practice run, each question is shot with its figure at both
// phone sizes in the light and the dark room (`bothSchemes`, fit.ts), and answered — typed or tapped.
// One copy for every spec that walks figures; the specs keep only their own questions. A sheet
// photographed in the chat is sent the same way by every spec that reads one (`sendPhoto`).

import { join } from 'node:path';

import { expect, type Page } from '@playwright/test';

const FIXTURES = join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures');

/**
 * A new parent account with a child Lena, onboarding done, on Buddy's screen. Born 2014 unless a
 * spec's scripted reading is keyed by another age (`year`, #350).
 */
export async function onboardChild(page: Page, tag: string, year = '2014'): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`${tag}-${Date.now()}@example.test`);
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
  await page.getByLabel('Jahr', { exact: true }).fill(year);
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

/** One photo attached in the chat and sent; its reading is done once the practice is ready. */
export async function sendPhoto(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Was möchtest du anhängen?' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Aus der Galerie' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'sharp.jpg'));
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByRole('button', { name: 'Jetzt üben' })).toBeVisible({ timeout: 30_000 });
}

/**
 * She writes `message`; Buddy offers a practice run with `offer` in his words, and she starts THAT
 * offer. The thread keeps every earlier offer card, and the new card enters a moment AFTER Buddy's
 * words, invisible while its entrance runs (issue #267, see modes.spec.ts `offerStart`). Waiting
 * for the words and then taking "the innermost block with these words and a start button" took the
 * thread itself: with several earlier cards a strict-mode error, with one earlier card a click on
 * that card — the previous practice, already finished, opened on "Geschafft!" (#403, written.spec).
 * Counting the buttons before she sends raced the other way: the home was still filling in its
 * thread. So the start button is the first one AFTER Buddy's words in the thread — earlier cards
 * stand above them — and the click waits until that card has entered and shows it.
 */
export async function startOffer(page: Page, message: string, offer: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(message);
  await page.getByRole('button', { name: 'Senden' }).click();
  const words = page.getByText(offer, { exact: false }).last();
  await expect(words).toBeVisible();
  await words.locator(`xpath=following::*[@role="button"][@aria-label="Los geht's"][1]`).click();
}

/**
 * A typed answer that code grades right, then on to the next question. A scheme switch before it
 * has landed (`bothSchemes`, issue #464): the field she types in is the one that stays.
 */
export async function typed(page: Page, text: string): Promise<void> {
  await page.getByLabel('Deine Antwort').fill(text);
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
}

/** A tapped option that code grades right, then on to the next question. */
export async function chosen(page: Page, option: string): Promise<void> {
  await page.getByRole('button', { name: option, exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
}
