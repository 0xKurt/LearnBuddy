// Core loop, part 2 of 5 (issue #381): Mia names her test (the parents allowed messages in the
// setup, so the chat does not ask, issue #518), she photographs her worksheet (a blurry one first)
// and Buddy prepares practice from it by himself. Starts from a fresh learner set up without
// shots (coreLoop.ts; part 1 checks that way). Scripted model:
// apps/api/src/testing/scenarios/core-loop.ts.

import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { freshEmail, homePositions, signUpMia, worksheetJpeg } from './coreLoop';
import { overflows, partHeight, settle, shot } from './fit';

test('core loop · plan: a test, a photo → practice prepared by Buddy', async ({ page }) => {
  const email = freshEmail('plan');
  await signUpMia(page, email);

  // ── Get to know: the test, and what Buddy needs for it ──
  await page
    .getByLabel('Schreib Buddy …')
    .fill('Ich schreibe am Freitag eine Mathearbeit über Brüche.');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByText('Super, dann bereiten wir uns bis Freitag zusammen vor.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/Eingetragen: Mathearbeit Brüche am/)).toBeVisible();
  // One card on top (the photo). Messages were answered in the setup, so the conversation does
  // not ask about them again (issue #518).
  await expect(page.getByText('Schick mir ein Foto')).toBeVisible();
  await expect(page.getByText('Darf ich dir Benachrichtigungen aufs Handy schicken?')).toHaveCount(
    0,
  );
  // The conversation stands at its newest message, like any chat: what Buddy just did is on
  // screen, not below the fold (05-buddy-planned-360).
  const newest = page.getByText(/Eingetragen: Mathearbeit Brüche am/);
  await expect(newest).toBeInViewport();
  // With the keyboard open (a small phone keeps ~420 pt of window) the newest message must
  // still be on screen — "wenn ich was schreibe, erkenne ich in der app gar nichts mehr"
  // (owner 28.09., issue #51).
  await page.setViewportSize({ width: 360, height: 420 });
  await expect(newest).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  // The card lies over the greeting and the ways to start: they stand where they stand
  // without a card (owner: "Die Meldung sollte einfach über dem Menü liegen").
  const homeAt = await homePositions(page);
  // The layer on top keeps its size contract (issue #17): one slim bar, ~60 pt collapsed,
  // plus the layer's 8 pt of air above it. Since issue #204 a NAME may take a second line
  // rather than end in "…" — that costs 20 pt, and only on a phone narrow enough to need it
  // ("Arbeitsbla…" was what a 360 pt phone showed). This stop is measured at 390.
  const captureBar = await partHeight(page, 'home-card', 'home-top');
  expect(captureBar, `top layer ${captureBar}pt`).toBeLessThanOrEqual(72);
  await shot(page, '05-buddy-planned');
  // The ask for the photo stands once, with its button (issue #94): while the bar on top
  // asks, no word-for-word "Ich warte auf dein Foto" receipt doubles it in the
  // conversation, and the way out — "Kein Foto nötig" — opens from the bar itself.
  await expect(page.getByText(/Ich warte auf dein Foto/)).toHaveCount(0);
  await page.getByRole('button', { name: /Arbeitsblatt Brüche\. Schick mir ein Foto/ }).click();
  await expect(page.getByRole('button', { name: 'Kein Foto nötig' })).toBeVisible();
  await page.getByRole('button', { name: /Arbeitsblatt Brüche\. Schick mir ein Foto/ }).click();
  await expect(page.getByRole('button', { name: 'Kein Foto nötig' })).toBeHidden();

  // ── The worksheet: photographed, sent, read in the background ──
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await expect(page.getByText('Fotografier dein Blatt')).toBeVisible();
  await shot(page, '07-capture-empty');
  const photo = await worksheetJpeg(page);
  // A blurry photo first: the phone itself says so at once, and "Neu fotografieren" replaces it.
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await (
    await chooser
  ).setFiles(join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures/blur.jpg'));
  await expect(page.getByText('Foto 1 ist unscharf.')).toBeVisible();
  await expect(page.getByText('Schwer lesbar')).toBeVisible();
  await shot(page, '08a-capture-blurry');
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Neu fotografieren' }).click();
  await (await chooser).setFiles(photo);
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await expect(page.getByText('Foto 1 ist unscharf.')).toHaveCount(0);
  await expect(page.getByText('Schwer lesbar')).toHaveCount(0);
  await shot(page, '08-capture-photo');
  await page.getByRole('button', { name: 'Senden' }).click();

  // ── Buddy acts on it by itself: reads it, prepares practice, says so ──
  // Here in the app the card says it now, and Buddy's message about it is in the chat with it
  // (she is in the app, so it is shown here, not pushed).
  // One slim line (owner request): what, how long, "Jetzt üben"; details on a tap.
  await expect(
    page.getByRole('button', { name: /^Übung bereit: Mathearbeit Brüche\./ }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/^4 Aufgaben · ca\. 5 Min\.$/)).toBeVisible();
  expect(await homePositions(page)).toEqual(homeAt);
  // The ready bar honours the same size contract as every layer on top (issue #17),
  // and carries the close button (swiping the layer away is walked through in tour.spec.ts).
  const readyBar = await partHeight(page, 'home-card', 'home-top');
  expect(readyBar, `top layer ${readyBar}pt`).toBeLessThanOrEqual(72);
  await expect(page.getByRole('button', { name: 'Karte ausblenden' })).toBeVisible();
  // The chat still stands at its newest message under the card.
  await expect(
    page.getByText('Aus deinem Arbeitsblatt habe ich eine kurze Übung gemacht.'),
  ).toBeInViewport();
  await shot(page, '09-buddy-prepared');

  // ── The state issue #204 is measured on: a test entered, a photo sent, practice ready ──
  // The owner on the promo footage: "schau dass die screens nicht ueberladen sind und alles
  // gut zu lesen und erkennen ist". What stood here was three status lines, two
  // "Rückgängig", a "nur hier in der App" under the card, and the bar on top repeating the
  // practice the chat had just listed with the same count and the same minutes.
  await page.setViewportSize({ width: 360, height: 740 });
  await settle(page);
  // One turn, one receipt: the two things of Buddy's first answer are ONE line now.
  await expect(
    page.getByText(
      /^Eingetragen: Mathearbeit Brüche am .* · Ich warte auf dein Foto: Arbeitsblatt Brüche$/,
    ),
  ).toBeVisible();
  // The bar on top says what is ready; the chat does not say it a second time.
  await expect(page.getByText(/Vorbereitet: Mathearbeit Brüche/)).toHaveCount(0);
  // "nur hier in der App" stands once, under Buddy's newest message — not under every card.
  expect(await page.getByText('nur hier in der App').count()).toBeLessThanOrEqual(1);
  // Buddy's last reply AND the start button are on screen together, with ONE way back.
  await expect(
    page.getByText('Aus deinem Arbeitsblatt habe ich eine kurze Übung gemacht.'),
  ).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Jetzt üben' })).toBeInViewport();
  // Every receipt in view carries its own ↺ (issue #520) — here the one receipt left.
  const waysBack = await page.getByRole('button', { name: /^Rückgängig/ }).count();
  expect(waysBack, 'one ↺ per receipt in view (issues #204, #520)').toBe(1);
  // …and none of it has to be scrolled to: the conversation fits this phone as it stands.
  const thread = (await overflows(page)).find((o) => o.label === 'scroll-thread');
  expect(thread?.overflow ?? 0, 'the thread must not need scrolling here').toBe(0);
  // The receipt's words are words (issue #520): no button, no sheet behind them.
  await expect(page.getByRole('button', { name: /^Eingetragen: Mathearbeit Brüche/ })).toHaveCount(
    0,
  );
  await page.setViewportSize({ width: 390, height: 844 });

  test.info().annotations.push({ type: 'email', description: email });
});
