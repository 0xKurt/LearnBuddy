// Browser walkthrough of „Erklär mal" (issue #236), same dev stack as the other walkthroughs;
// scripted answers in apps/api/src/testing/scenarios/teachBack.ts. She asks Buddy to quiz her on
// photosynthesis, taps the offer, explains in her own words, gets a ✓ per key point and ONE
// follow-up question, answers it, and the explanation is complete. No new screen: the offer card
// in the chat and the practice card she already knows.
// Screenshots go to test-results/web/shots.

import { expect, test, type Page } from '@playwright/test';

import { bothSchemes, setScheme, shot } from './fit';

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
  await page.getByRole('button', { name: 'Weiter' }).click();
  // Notifications are asked of the adults right after their PIN (issue #518).
  await page.getByRole('button', { name: 'Nein, danke' }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

test('Erklär mal: she explains, gets a ✓ per point and one follow-up (issue #236)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Frag mich zur Fotosynthese ab');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('erklär mir die Fotosynthese', { exact: false })).toBeVisible();
  await expect(offerStart(page, 'Erklär mal')).toBeVisible();
  await bothSchemes(page, '70-erklaer-offer');

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
  await bothSchemes(page, '71-erklaer-question');

  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Und wo in der Zelle passiert das?', { exact: false })).toBeVisible();
  await expect(page.getByText('✓ Licht', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Ort fehlt noch', { exact: false })).toBeVisible();
  await bothSchemes(page, '72-erklaer-followup');

  await field.fill('Das passiert in den Chloroplasten.');
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
  // … the second at night, after Buddy showed one point and she explained the rest (#298).
  await expect(
    page.getByText('Erklär mir, warum Pflanzen ohne Licht nicht wachsen.'),
  ).toBeVisible();
  // Stuck at the start: „Tipp" shows ONE point as a model sentence and asks for the next one.
  await page.getByRole('button', { name: 'Einen Tipp bekommen' }).click();
  await expect(page.getByText('ohne Licht keine Energie', { exact: false })).toBeVisible();
  await expect(
    page.getByText('Was kann sie dann nicht herstellen?', { exact: false }),
  ).toBeVisible();
  await bothSchemes(page, '74-erklaer-vormachen');
  await setScheme(page, 'dark');
  await field.fill('Dann macht sie keinen Zucker, und den braucht sie zum Wachsen.');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Alles drin', { exact: false })).toBeVisible();
  // The point Buddy showed stands as shown, never as hers.
  await expect(page.getByText('Energie vorgemacht', { exact: false })).toBeVisible();
  await shot(page, '73-erklaer-done-dark');
});
