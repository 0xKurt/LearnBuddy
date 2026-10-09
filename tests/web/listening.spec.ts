// Browser walkthrough of Hörverstehen (issues #210, #311 step 2), same dev stack as the other
// walkthroughs; scripted answers in apps/api/src/testing/scenarios/listening.ts. She asks Buddy to
// practise listening, taps the offer, hears the text through the one listen control
// (`ListenButton`: "Anhören" and the quiet "Langsam"), answers, and only then reads what was said.
//
// Needs a voice: the dev stack has one only with `LB_DEV_SPEECH=fake` (silent WAV audio, see
// docs/architecture.md §Voice). Without it a listening run is refused before anything is
// prepared — by design — so this spec says so and skips instead of failing on a missing provider.
// Screenshots go to test-results/web/shots.

import { expect, test, type Page } from '@playwright/test';

import { onboardChild, startOffer } from './figureWalk';
import { bothSchemes, shot } from './fit';

test.skip(
  process.env.LB_DEV_SPEECH !== 'fake',
  'a listening run needs a voice: run with LB_DEV_SPEECH=fake (docs/architecture.md §Voice)',
);

const listenCall = (page: Page) =>
  page.waitForResponse((r) => r.url().includes('/listen') && r.request().method() === 'POST');

test('Hörverstehen: she hears the text, answers, then reads it (#210, #311)', async ({ page }) => {
  await onboardChild(page, 'listening');
  await startOffer(page, 'Ich möchte Hörverstehen üben', 'Toms Samstag');

  // The question, and the way to hear the text — the text itself is nowhere on the screen.
  await expect(page.getByText('Was kaufte Tom für seine Schwester?')).toBeVisible();
  await expect(page.getByText('blaue Kerze', { exact: false })).toHaveCount(0);
  const listen = page.getByRole('button', { name: 'Anhören', exact: true });
  await expect(listen).toBeVisible();
  await expect(page.getByRole('button', { name: 'Langsam anhören' })).toBeVisible();
  await bothSchemes(page, '64-hoertext-question');

  // Playing works: the app asks the server for the recording and plays it; once it sounded the
  // pill offers to hear it again.
  const heard = listenCall(page);
  await listen.click();
  expect((await heard).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Nochmal hören' })).toBeVisible({
    timeout: 15_000,
  });

  // She answers; once the question is closed the words of the text arrive, under the pills.
  await page.getByLabel('Deine Antwort').fill('ein Buch über Pferde');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Das war der Hörtext')).toBeVisible();
  await expect(page.getByText('blaue Kerze', { exact: false })).toBeVisible();
  // Light only: a scheme switch rebuilds the screen, which then opens on the next open question.
  await shot(page, '65-hoertext-closed');
});
