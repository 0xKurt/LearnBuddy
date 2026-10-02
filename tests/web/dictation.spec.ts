// Browser walkthrough of the Diktat (issue #242), same dev stack as the other walkthroughs;
// scripted answers in apps/api/src/testing/scenarios/dictation.ts. She asks Buddy for a Diktat
// of her Lernwörter, taps the offer, hears the word, types it — the microphone is off — and a
// miss is answered with the place it went wrong.
//
// Needs a voice: the dev stack has one only with `LB_DEV_SPEECH=fake` (silent WAV audio, see
// docs/architecture.md §Voice). Without it a Diktat is refused before anything is prepared — by
// design — so this spec says so and skips instead of failing on a missing provider.
// Screenshots go to test-results/web/shots.

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

test.skip(
  process.env.LB_DEV_SPEECH !== 'fake',
  'a Diktat needs a voice: run with LB_DEV_SPEECH=fake (docs/architecture.md §Voice)',
);

/** The words every offer card's button carries (components/learn/OfferCard.tsx). */
const START = "Los geht's";

/** The start button of the offer whose card says `says` (see modes.spec.ts, issue #267). */
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
  await page.getByLabel('E-Mail').fill(`diktat-${Date.now()}@example.test`);
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
  await page.getByLabel('Jahr', { exact: true }).fill('2016');
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

test('Diktat: she hears the word, types it, the mic is off (issue #242)', async ({ page }) => {
  await onboardChild(page);
  await page
    .getByLabel('Schreib Buddy …')
    .fill('Mach mit mir ein Diktat: Schwimmen, Biene, Straße');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('ich lese dir deine Lernwörter vor', { exact: false })).toBeVisible();
  await offerStart(page, 'Diktat üben').click();

  // The question: a fixed line and the recording — the word itself is nowhere on the screen.
  await expect(page.getByText('Hör gut zu und schreib das Wort.')).toBeVisible();
  for (const word of ['Schwimmen', 'Biene', 'Straße']) {
    await expect(page.getByText(word, { exact: false })).toHaveCount(0);
  }
  // The mic is off, and one short line says why.
  await expect(page.getByRole('button', { name: 'Antwort sagen' })).toHaveCount(0);
  await expect(page.getByText('Das Mikro ist hier aus – du übst das Schreiben.')).toBeVisible();
  await shot(page, '60-diktat-question');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '60b-diktat-question-night');
  await page.emulateMedia({ colorScheme: 'light' });

  // Playing works: the app asks the server for the recording and plays it; once it sounded, the
  // pill offers to hear it again.
  const heard = page.waitForResponse(
    (r) => r.url().includes('/listen') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Hörtext abspielen' }).click();
  expect((await heard).status()).toBe(200);
  await expect(page.getByText('Nochmal hören')).toBeVisible();
  // And slower, as often as she likes.
  const slow = page.waitForResponse(
    (r) => r.url().includes('/listen') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Langsam anhören' }).click();
  expect((await slow).status()).toBe(200);

  // A miss names the place, without a model and without spelling the word out.
  const field = page.getByLabel('Deine Antwort');
  await field.fill('Schwimen');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Fast – bei „Schwimen“ fehlt ein Doppel-m.')).toBeVisible();
  await expect(page.getByText('Schwimmen', { exact: true })).toHaveCount(0);
  await shot(page, '61-diktat-feedback');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '61b-diktat-feedback-night');
  await page.emulateMedia({ colorScheme: 'light' });

  await field.fill('Schwimmen');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Hör gut zu und schreib das Wort.')).toBeVisible();
});
