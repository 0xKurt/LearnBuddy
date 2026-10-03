// Conversation mode, Buddy speaking (issues #35/#41), with Chromium's own fake microphone:
// a 20 ms beep twice a second. While he speaks the mic's level is watched for her voice
// (barge-in) — and a beep is exactly what must NOT stop him (lib/speech/bargeIn.ts). So here
// he reads every reply to the end, and the loop listens again by itself: the app's own
// stopwatch (`first_audio`, `relisten`) lands in test-results/web/perf.jsonl.
// Her talking over him is talk-barge.spec.ts (a microphone that "speaks").

import { expect, test } from '@playwright/test';

import { recordPerf } from './perf';
import { onboardTalker, REPLY, sayOneThing, voiceAsSilence } from './talk';

test('Buddy reads to the end over beeps, and listens again by himself', async ({ page }) => {
  await onboardTalker(page, 'talk');
  await voiceAsSilence(page, 3000);

  // Three turns for the numbers (docs/speed-audit.md): each reply is read to the end — the
  // beeps never stop him — and the mic opens again by itself.
  for (let turn = 0; turn < 3; turn++) {
    await sayOneThing(page, turn === 0);
    await expect(page.getByText(REPLY).last()).toBeVisible();
    await expect(page.getByText('Buddy spricht …')).toBeVisible();
    // Only once the ear really hears does the screen say she can just talk (rule 5).
    await expect(page.getByText('Sprich einfach dazwischen, dann hört er dir zu.')).toBeVisible();
    await expect(page.getByText('Ich höre zu.')).toBeVisible({ timeout: 15_000 });
    // The recorder really runs: that is where the `relisten` span ends.
    await expect(page.getByRole('button', { name: 'Aufnahme stoppen' })).toBeVisible();
    const spans = await recordPerf(page, 'talk-voice');
    expect(spans.map((s) => s.action)).toContain('relisten');
  }

  // Tapping Buddy still interrupts him, as before the ear (issue #35). The speaking state's
  // shots come from talk-barge.spec.ts: one exchange per size and scheme, no repeated reply.
  await page.unroute('**/v1/voice/speech');
  await voiceAsSilence(page, 15_000);
  await sayOneThing(page, false);
  await expect(page.getByText('Buddy spricht …')).toBeVisible();
  await page.getByRole('button', { name: 'Unterbrechen und sprechen' }).first().click();
  await expect(page.getByText('Buddy spricht …')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aufnahme stoppen' })).toBeVisible();
  await page.getByRole('button', { name: 'Beenden' }).last().click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
});
