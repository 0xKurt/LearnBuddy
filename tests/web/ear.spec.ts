// Ear training (issue #445): she hears two notes and names the interval, or hears a rhythm and taps
// it back. Scripted answers in apps/api/src/testing/scenarios/ear.ts; the model chose only the
// notes or the rhythm — question, options, key and tones are the server's, the sound is the app's
// own synthesis (lib/music/tone.ts) through the one listening hook, and her taps are measured by
// code (apps/api/src/modules/practice/rhythm.ts). Every verdict below is code's; no tutor is
// scripted. Shot at both phone sizes, light and dark (test-results/web/shots, 78-…).

import { expect, test, type Page } from '@playwright/test';

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

/**
 * Her beats on the pad at exactly these moments (ms from the first), dispatched in the page and
 * timed on the page's own monotonic clock — the clock the pad reads. One click per beat from the
 * test runner would add its round trip to every gap, and on a loaded machine that is more than the
 * tolerance (150 ms at tempo 80). A beat is a press and a release; the pad counts the press.
 *
 * Unlike a click, a dispatch does not wait for the element to hold still: after a switch of the
 * colour scheme the whole tree is mounted anew (`ThemeProvider`'s `key`), and beats sent to the
 * pad of the old tree reach nothing (seen in the walkthrough: no beat counted). So the screen
 * settles first, and a pad that left the page during the beats fails here, by name.
 */
async function beats(page: Page, at: number[]): Promise<void> {
  await settle(page);
  const pad = page.getByRole('button', { name: 'Hier klopfen', exact: true });
  const stayed = await pad.evaluate((pad, times) => {
    const box = pad.getBoundingClientRect();
    const where = {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
    };
    const start = performance.now();
    for (const t of times) {
      while (performance.now() - start < t) {
        // the moment of this beat
      }
      pad.dispatchEvent(new MouseEvent('mousedown', where));
      pad.dispatchEvent(new MouseEvent('mouseup', where));
    }
    return pad.isConnected;
  }, at);
  expect(stayed, 'the pad stayed on the page while she tapped').toBe(true);
}

test('ear training: a heard rhythm tapped back, its timing measured by code (#445)', async ({
  page,
}) => {
  await onboardChild(page, 'rhythm');
  await startOffer(page, 'Lass uns Rhythmus nachklopfen üben', 'Rhythmus nachklopfen');

  // ── Heard, not read: nothing drawn, the pad is the whole answer ──
  await expect(page.getByText('Klopf den Rhythmus nach.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('question-figure')).toHaveCount(0);
  await expect(page.getByTestId('answer-taps')).toBeVisible();
  const check = page.getByRole('button', { name: 'Prüfen', exact: true });
  await expect(check).toBeDisabled();

  // One tap plays the rhythm (a 4/4 bar at 80 = 3 s) on one tone; then it is "Anhören" again.
  const listen = page.getByRole('button', { name: 'Anhören', exact: true });
  await listen.click();
  await expect(page.getByRole('button', { name: 'Anhalten', exact: true })).toBeVisible();
  await expect(listen).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Hier kommt gerade kein Ton heraus.')).toHaveCount(0);

  await shot(page, '78-ear-rhythm');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '78-ear-rhythm-dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // ── One beat short: each beat shows, "Neu klopfen" takes them back, and the count is said ──
  await beats(page, [0, 750, 1500]);
  await expect(page.getByRole('img', { name: '3 Schläge geklopft' })).toBeVisible();
  await page.getByRole('button', { name: 'Neu klopfen', exact: true }).click();
  await expect(page.getByRole('img', { name: /geklopft/ })).toHaveCount(0);
  await beats(page, [0, 750, 1500, 1875]);
  await expect(page.getByRole('img', { name: '4 Schläge geklopft' })).toBeVisible();
  await shot(page, '78-ear-rhythm-tapped');
  await check.click();
  const again = page.getByText('Es kamen mehr Töne, als du geklopft hast.', { exact: false });
  await expect(again).toBeVisible();
  await expect(page.getByText('4 Schläge geklopft', { exact: true })).toBeVisible();
  await shot(page, '78-ear-rhythm-again');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '78-ear-rhythm-again-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  // On the small phone too: the line is what she reads next, so it stands whole there (rule 17).
  await page.setViewportSize({ width: 360, height: 740 });
  await settle(page);
  await expect(again).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 390, height: 844 });

  // ── In her own time — a little slower and a little wobbly, as a child taps on a phone: right ──
  await beats(page, [0, 820, 1660, 2080, 2470]);
  await check.click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  // Closed, the rhythm stays to hear it again next to the verdict; the pad is gone.
  await expect(listen).toBeVisible();
  await expect(page.getByTestId('answer-taps')).toHaveCount(0);
  await shot(page, '78-ear-rhythm-solved');
});
