// Core loop, part 3 of 5 (issue #381): the prepared practice, checked with calm feedback;
// feedback to Buddy is remembered; the finished practice stands in the conversation and the
// greeting knows about it after a restart. Starts from a fresh learner with a test, the parent's
// yes and a worksheet sent (coreLoop.ts; part 2 checks that way).

import { expect, test } from '@playwright/test';

import {
  freshEmail,
  homePositions,
  planTest,
  practise,
  sendWorksheet,
  signUpMia,
} from './coreLoop';
import { shot } from './fit';
import { recordPerf } from './perf';

test('core loop · practice: short practice, feedback remembered, the greeting after it', async ({
  page,
}) => {
  const email = freshEmail('practice');
  await signUpMia(page, email);
  await planTest(page);
  await sendWorksheet(page);
  // Where the mark and the ways in stand with a card on top: part 2 holds that they stand the
  // same with and without one; here they must not move through practice and feedback.
  const homeAt = await homePositions(page);

  // ── The useful result: short practice, checked, with calm feedback ──
  await practise(page, async (n, choice) => {
    if (n === 1 || choice) await shot(page, `10-practice-q${n}`);
  });
  // A true, kind sentence instead of a hit rate (user feedback #1).
  await expect(page.getByText('Alles saß gleich beim ersten Mal', { exact: false })).toBeVisible();
  await expect(page.getByText('Auf Anhieb richtig')).toHaveCount(0);
  await shot(page, '11-practice-summary');
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Feedback understood, behaviour adapted ──
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  await page.getByLabel('Schreib Buddy …').fill('Mach die Übungen bitte kürzer.');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Mach ich – ab jetzt kurze Runden.')).toBeVisible();
  await expect(page.getByText('Gemerkt: Möchte kurze Übungen')).toBeVisible();
  expect(await homePositions(page)).toEqual(homeAt);
  await expect(page.getByText('Gemerkt: Möchte kurze Übungen')).toBeInViewport();
  await shot(page, '12-buddy-feedback');

  // ── The finished practice stands in the conversation, not on top (issue #17): the same
  // kind words, the full view one tap away — and nothing lies over the way to start ──
  const card = page.getByTestId('home-card');
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Mehr', exact: true }).click({ trial: true });
  await shot(page, '12b-buddy-result-in-thread');
  await page.getByRole('button', { name: 'Ansehen' }).click();
  // The full summary again (the thread behind keeps its short version of the same words).
  await expect(
    page.getByText('Alles saß gleich beim ersten Mal', { exact: false }).last(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  // What the app's own stopwatch measured on the way here (issue #66) — read before the
  // reload, which is what clears it (the spans live in memory, nothing is stored).
  await recordPerf(page, 'core-loop');
  await page.reload();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  await expect(page.getByText('Gemerkt: Möchte kurze Übungen')).toBeVisible();
  await expect(card).toHaveCount(0);

  // ── Opening the app again right after a practice: the greeting knows about it (#195) ──
  // A reload IS the app's own start, so this is the owner's screenshot from the promo
  // footage: „Das ist auch doof — Hi Lienne! / Done. — Was für ne tolle conversation". Buddy
  // said hello as if nothing had happened, and a flat „Geschafft! Du hast 4 Fragen
  // beantwortet." card stood under it. One sentence now, composed on the phone from the
  // home's own payload — no model call, no second request.
  await expect(page.getByText('Hey Mia – 4 Fragen, alles gleich beim ersten Mal.')).toBeVisible();
  // And said ONCE: nothing repeats it as a card below.
  await expect(page.getByText('Geschafft!')).toHaveCount(0);
  await expect(page.getByText('Du hast 4 Fragen beantwortet.')).toHaveCount(0);
  // The full view stays one tap away — now from the greeting itself.
  await expect(page.getByRole('button', { name: 'Ansehen' })).toHaveCount(1);
  await shot(page, '12c-buddy-greeting-after-practice');

  test.info().annotations.push({ type: 'email', description: email });
});
