// Browser walkthrough of „Erklär mal" (issue #236), same dev stack as the other walkthroughs;
// scripted answers in apps/api/src/testing/scenarios/teachBack.ts. She asks Buddy to quiz her on
// photosynthesis, taps the offer, explains in her own words, gets a ✓ per key point and ONE
// follow-up question, answers it, and the explanation is complete. No new screen: the offer card
// in the chat and the practice card she already knows.
// Screenshots go to test-results/web/shots.

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

/** The words every offer card's button carries (components/learn/OfferCard.tsx). */
const START = "Los geht's";

function offerStart(page: Page, says: string) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: START }) })
    .filter({ hasText: says })
    .last()
    .getByRole('button', { name: START });
}

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`erklaer-${Date.now()}@example.test`);
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
  await page.getByLabel('Jahr', { exact: true }).fill('2013');
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

/** One stop of the walk, in daylight and at night, at 390×844 and 360×740 (`shot`). */
async function both(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-night`);
  await page.emulateMedia({ colorScheme: 'light' });
}

test('Erklär mal: she explains, gets a ✓ per point and one follow-up (issue #236)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Frag mich zur Fotosynthese ab');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('erklär mir die Fotosynthese', { exact: false })).toBeVisible();
  await expect(offerStart(page, 'Erklär mal')).toBeVisible();
  await both(page, '70-erklaer-offer');

  await offerStart(page, 'Erklär mal').click();
  await expect(page.getByText('Erklär mir, wie die Fotosynthese funktioniert.')).toBeVisible();
  // The key points are nowhere on the screen while she explains.
  await expect(page.getByText('Chloroplasten', { exact: false })).toHaveCount(0);
  const field = page.getByLabel('Deine Antwort');
  // She can speak it (the mic of voice mode) or type it.
  await expect(page.getByRole('button', { name: 'Antwort sagen' })).toBeVisible();
  await field.fill(
    'Die Pflanze nimmt Licht als Energie. Aus Wasser und Kohlendioxid macht sie Zucker und Sauerstoff.',
  );
  await both(page, '71-erklaer-question');

  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Und wo in der Zelle passiert das?', { exact: false })).toBeVisible();
  await expect(page.getByText('✓ Licht', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Ort fehlt noch', { exact: false })).toBeVisible();
  await both(page, '72-erklaer-followup');

  await expect(async () => {
    await field.fill('Das passiert in den Chloroplasten.');
    await expect(field).toHaveValue('Das passiert in den Chloroplasten.', { timeout: 1000 });
  }).toPass();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Alles drin', { exact: false })).toBeVisible();
  await expect(page.getByText('✓ Ort', { exact: false })).toBeVisible();
  // Closed states are shot in one scheme each: a switch rebuilds the screen, which then opens on
  // the next open question (see dictation.spec.ts). The first in daylight …
  await shot(page, '73-erklaer-done');
  await page
    .getByRole('button', { name: 'Weiter' })
    .click({ timeout: 5000 })
    .catch(() => undefined);
  // … the second at night, explained completely in one go.
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(
    page.getByText('Erklär mir, warum Pflanzen ohne Licht nicht wachsen.'),
  ).toBeVisible();
  await expect(async () => {
    await field.fill(
      'Im Dunkeln hat sie keine Energie, dann macht sie keinen Zucker und der fehlt ihr zum Wachsen.',
    );
    await expect(field).not.toHaveValue('', { timeout: 1000 });
  }).toPass();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Alles drin', { exact: false })).toBeVisible();
  await shot(page, '73-erklaer-done-night');
});
