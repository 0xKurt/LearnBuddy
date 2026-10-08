// Browser walkthrough of the flashcards (issue #147, Stufe 2; the bar and the ✕ since #384).
// Scripted model in apps/api/src/testing/scenarios/cards.ts: two French words, the first one not
// at once, the run over — its card. The card pass is built like every practice screen: the round
// ✕ in the header, the card, her question to the tutor in the one input bar with the card's action
// beside it ("Umdrehen", then "Noch nicht" / "Wusste ich" across under the pill), the reply under
// the card. Every stop is shot at both phone sizes, light and dark (test-results/web/shots, 101-…).

import { expect, test, type Page } from '@playwright/test';

import { onboardChild, startOffer } from './figureWalk';
import { bothSchemes } from './fit';
import { voiceAsSilence } from './talk';

/** Her typed answer to the open word, checked. */
async function answer(page: Page, text: string): Promise<void> {
  await page.getByLabel('Deine Antwort').fill(text);
  await page.getByRole('button', { name: 'Prüfen' }).click();
}

test('flashcards: the one bar with her question, the card’s action, the round ✕ (#384)', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await onboardChild(page, 'cards');
  await startOffer(page, 'Lass uns Vokabeln mit Frosch üben', 'zwei Wörter aus Unité 3');

  // The run: the first word not at once, every other right away.
  await expect(page.getByText('la grenouille')).toBeVisible();
  await answer(page, 'die Kröte');
  await expect(page.getByText('Versuch es nochmal', { exact: false })).toBeVisible();
  await answer(page, 'der Frosch');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('le citron')).toBeVisible();
  await answer(page, 'die Zitrone');
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  // Each word the other way round too.
  for (const [prompt, word] of [
    ['der Frosch', 'la grenouille'],
    ['die Zitrone', 'le citron'],
  ] as const) {
    await expect(page.getByRole('heading', { name: prompt })).toBeVisible();
    await answer(page, word);
    await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
    await page.getByRole('button', { name: 'Weiter' }).click();
  }

  // The run over: the word that did not sit, as a card.
  await page.getByRole('button', { name: 'Die Wörter als Karten durchgehen' }).click();
  await expect(page.getByText('Karte 1 von 1')).toBeVisible();
  // The round ✕ like every practice screen; no worded "Beenden" (#384).
  await expect(page.getByRole('button', { name: 'Lernkarten beenden' })).toBeVisible();
  await expect(page.getByText('Beenden', { exact: true })).toHaveCount(0);
  // The one input bar: her question in the field, "Umdrehen" where "Prüfen" stands.
  await expect(page.getByTestId('ask-field')).toBeVisible();
  await bothSchemes(page, '101-cards-front');

  // Vorlesen in the pass's head too, the same switch as every practice (#434): the front is read
  // in its own language when it comes up, and a tap on it reads it again — no button of its own.
  // Buddy's voice as a short silence (the dev stack has none). .last(): the chat's head stays
  // mounted under this screen.
  await voiceAsSilence(page, 300);
  const spoken = () =>
    page.waitForRequest((r) => r.url().includes('/voice/speech') && r.method() === 'POST');
  const firstRead = spoken();
  await page.getByRole('switch', { name: 'Vorlesen', exact: true }).last().click();
  expect((await firstRead).postDataJSON()).toMatchObject({
    text: 'la grenouille',
    locale: 'fr-FR',
  });
  const reread = spoken();
  await page.getByTestId('card').getByRole('button', { name: 'Nochmal vorlesen' }).click();
  expect((await reread).postDataJSON()).toMatchObject({ text: 'la grenouille' });
  await bothSchemes(page, '101-cards-read-aloud');
  await page.getByRole('switch', { name: 'Vorlesen ist an' }).last().click();
  await page.unroute('**/v1/voice/speech');

  // Her question about the card: the tutor's reply under it, nothing rated.
  await page.getByTestId('ask-field').fill('Ist grenouille weiblich?');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('das „la“ zeigt es', { exact: false })).toBeVisible();
  await expect(page.getByText('Karte 1 von 1')).toBeVisible();
  await bothSchemes(page, '101-cards-asked');

  // Turned over: "Noch nicht" / "Wusste ich", side by side, under the field.
  await page.getByRole('button', { name: 'Umdrehen' }).click();
  await expect(page.getByText('der Frosch')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Noch nicht' })).toBeVisible();
  await bothSchemes(page, '101-cards-back');

  await page.getByRole('button', { name: 'Wusste ich' }).click();
  await expect(page.getByText('Durch!')).toBeVisible();
  await bothSchemes(page, '101-cards-end');
});
