// Ear training (issue #445): she hears two notes and names the interval. Scripted answers in
// apps/api/src/testing/scenarios/ear.ts; the model chose only the two notes — question, options,
// key and tones are the server's, the sound is the app's own synthesis (lib/music/tone.ts) through
// the one listening hook. Every verdict below is code's; no tutor is scripted. Shot at both phone
// sizes, light and dark (test-results/web/shots, 78-…).

import { expect, test } from '@playwright/test';

import { chosen, onboardChild, startOffer } from './figureWalk';
import { settle, shot } from './fit';

test('ear training: two notes heard, the interval named, graded by code (#445)', async ({
  page,
}) => {
  await onboardChild(page, 'ear');
  await startOffer(page, 'Lass uns Intervalle hören üben', 'Intervalle hören');

  // ── Heard, not read: no staff is drawn, the tones are the question ──
  await expect(page.getByText('Welches Intervall hörst du?', { exact: false })).toBeVisible();
  await expect(page.getByTestId('question-figure')).toHaveCount(0);
  const listen = page.getByRole('button', { name: 'Anhören', exact: true });
  const stop = page.getByRole('button', { name: 'Anhalten', exact: true });
  // The same four options as the interval read off a staff, in the order of the steps.
  for (const option of ['große Sekunde', 'kleine Terz', 'große Terz', 'reine Quarte'])
    await expect(page.getByRole('button', { name: option, exact: true })).toBeVisible();

  // One tap plays the two notes (two halves at 80 = 3 s) and the pill says so; when they have
  // sounded it is "Anhören" again — the player ended them, it did not fail ("kein Ton").
  await listen.click();
  await expect(stop).toBeVisible();
  await shot(page, '78-ear-playing');
  await expect(listen).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Hier kommt gerade kein Ton heraus.')).toHaveCount(0);
  // A second tap stops it at once.
  await listen.click();
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(listen).toBeVisible();

  await shot(page, '78-ear-interval');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '78-ear-interval-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // ── A wrong tap: code's own line, which says what to do and not what is right ──
  await page.getByRole('button', { name: 'große Terz', exact: true }).click();
  const again = page.getByText('Noch nicht ganz. Hör nochmal hin', { exact: false });
  await expect(again).toBeVisible();
  await shot(page, '78-ear-again');
  // On the small phone too: the line is what she reads next, so it stands whole there (rule 17).
  await page.setViewportSize({ width: 360, height: 740 });
  await settle(page);
  await expect(again).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 390, height: 844 });
  await chosen(page, 'kleine Terz');

  // ── The second one, from the bass: a perfect fifth ──
  await expect(page.getByText('Welches Intervall hörst du?', { exact: false })).toBeVisible();
  await expect(listen).toBeVisible();
  await page.getByRole('button', { name: 'reine Quinte', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  // Closed, the tones stay to hear it again next to the verdict.
  await expect(listen).toBeVisible();
  await shot(page, '78-ear-solved');
});
