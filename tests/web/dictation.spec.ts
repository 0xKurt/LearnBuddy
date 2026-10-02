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

/** One stop of the walk, in daylight and at night, at 390×844 and 360×740 (`shot`). */
async function both(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-night`);
  await page.emulateMedia({ colorScheme: 'light' });
}

const listenCall = (page: Page) =>
  page.waitForResponse((r) => r.url().includes('/listen') && r.request().method() === 'POST');

/** One stop in the CURRENT colour scheme, at 390×844 and 360×740 (`shot`). */
async function one(page: Page, name: string, night: boolean): Promise<void> {
  await shot(page, night ? `${name}-night` : name);
}

async function scheme(page: Page, night: boolean): Promise<void> {
  await page.emulateMedia({ colorScheme: night ? 'dark' : 'light' });
}

test('Diktat: she hears the word, types it, the mic is off (issue #242)', async ({ page }) => {
  await onboardChild(page);
  await page
    .getByLabel('Schreib Buddy …')
    .fill('Mach mit mir ein Diktat: Schwimmen, Biene, Straße, Fahrrad');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('ich lese dir deine Lernwörter vor', { exact: false })).toBeVisible();
  await offerStart(page, 'Diktat üben').click();

  // The question: a fixed line and the way to hear it — the word itself is nowhere on the screen.
  await expect(page.getByText('Hör zu und schreib das Wort.')).toBeVisible();
  // Visible text only: the chat she came from stays mounted behind this screen, and it holds the
  // list she typed herself.
  for (const word of ['Schwimmen', 'Biene', 'Straße', 'Fahrrad']) {
    await expect(page.getByText(word, { exact: false }).filter({ visible: true })).toHaveCount(0);
  }
  // The mic is off, and the field says so where she looks anyway.
  await expect(page.getByRole('button', { name: 'Antwort sagen' })).toHaveCount(0);
  const field = page.getByLabel('Deine Antwort');
  await expect(field).toHaveAttribute('placeholder', 'Schreib, was du hörst – ohne Mikro');
  await both(page, '60-diktat-question');

  // Playing works: the app asks the server for the recording and plays it; once it sounded, the
  // big button offers to hear it again and steps back.
  let heard = listenCall(page);
  await page.getByRole('button', { name: 'Anhören', exact: true }).click();
  expect((await heard).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Nochmal hören' })).toBeVisible();
  // And slower, as often as she likes.
  heard = listenCall(page);
  await page.getByRole('button', { name: 'Langsam anhören' }).click();
  expect((await heard).status()).toBe(200);
  await field.fill('Schwimen');
  // Open questions survive the switch to the night palette, "heard" included.
  await both(page, '61-diktat-typed');
  await expect(page.getByRole('button', { name: 'Nochmal hören' })).toBeVisible();

  // A miss names the place, without a model and without spelling the word out.
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Fast – bei „Schwimen“ fehlt ein Doppel-m.')).toBeVisible();
  await expect(page.getByText('Schwimmen', { exact: true }).filter({ visible: true })).toHaveCount(
    0,
  );
  await both(page, '62-diktat-feedback');

  // Closed states are shot in one scheme each — a switch rebuilds the screen, which then opens
  // on the next open question. Word 1 right and word 2 shown in daylight, 3 and 4 at night.
  for (const night of [false, true]) {
    await scheme(page, night);
    const [right, missed, shownWord] = night
      ? (['Straße', 'Farad', 'Fahrrad'] as const)
      : (['Schwimmen', 'bine', 'Biene'] as const);
    await field.fill(right);
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
    await one(page, '63-diktat-right', night);
    // On to the next word ("Weiter", unless the app has moved on by itself already).
    await page
      .getByRole('button', { name: 'Weiter' })
      .click({ timeout: 5000 })
      .catch(() => undefined);
    await expect(page.getByRole('button', { name: 'Anhören', exact: true })).toBeVisible();
    // Three misses: then the word is shown, once, kindly.
    for (let n = 0; n < 3; n++) {
      await field.fill(missed);
      await page.getByRole('button', { name: 'Prüfen' }).click();
      // Sent: the field empties once the answer is on its way (the third closes the question).
      if (n < 2) await expect(field).toHaveValue('');
    }
    await expect(
      page.getByText('Kein Problem – so schreibt man es.', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText(shownWord, { exact: true }).filter({ visible: true })).toHaveCount(
      1,
    );
    await one(page, '64-diktat-shown', night);
    await page
      .getByRole('button', { name: 'Weiter' })
      .click({ timeout: 5000 })
      .catch(() => undefined);
    if (!night) await expect(page.getByText('Frage 3 von 4')).toBeVisible();
  }
});
