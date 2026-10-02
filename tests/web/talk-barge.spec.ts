// Barge-in (issue #35): she talks while Buddy speaks — he stops and listens. The microphone
// is a file here (`--use-file-for-fake-audio-capture`): silence, then something with the level
// and rhythm of a voice. The gate first learns how loud Buddy's echo is (silence, in a browser
// without speakers), then hears her voice clearly above it for long enough, and stops him —
// long before his 20-second reply would have ended.

import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { shot } from './fit';
import { recordPerf } from './perf';
import { FIXTURES, onboardTalker, REPLY, sayOneThing, voiceAsSilence, voiceFile } from './talk';

const MIC = voiceFile(join(FIXTURES, 'barge-voice.wav'), 3000, 3000);

test.use({
  launchOptions: {
    executablePath: process.env.LB_CHROMIUM ?? '/opt/pw-browsers/chromium',
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${MIC}`,
    ],
  },
});

test('she talks over Buddy: he stops and listens', async ({ page }) => {
  await onboardTalker(page, 'barge');
  await voiceAsSilence(page, 20_000);

  await sayOneThing(page, true);
  await expect(page.getByText(REPLY).last()).toBeVisible();
  await expect(page.getByText('Buddy spricht …')).toBeVisible();
  const speaking = Date.now();
  // Her voice comes in: he stops long before his 20 s are over, and the mic runs.
  await expect(page.getByText('Ich höre zu.')).toBeVisible({ timeout: 12_000 });
  const stoppedAfter = Date.now() - speaking;
  // …and not before her voice: the file opens with 3 s of silence for each stream it feeds
  // (measured: he stopped 3.9 s in — her voice plus the gate's 300 ms, plus the screen).
  expect(stoppedAfter).toBeGreaterThan(3000);
  expect(stoppedAfter).toBeLessThan(12_000);
  await expect(page.getByText('Buddy spricht …')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aufnahme stoppen' })).toBeVisible();
  // Not the end of his reading: the loop's own re-listen never started (that one is `relisten`).
  const spans = await recordPerf(page, 'talk-barge');
  expect(spans.map((s) => s.action)).not.toContain('relisten');
  await shot(page, '35-talk-barged-in');

  // What she said next is a normal turn.
  await page.getByRole('button', { name: 'Aufnahme stoppen' }).click();
  await expect(page.getByText('Was steht diese Woche an?').last()).toBeVisible();
  await page.getByRole('button', { name: 'Beenden' }).last().click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
});
