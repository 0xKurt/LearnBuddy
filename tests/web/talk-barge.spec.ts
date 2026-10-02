// Barge-in (issue #35): she talks while Buddy speaks — he stops and listens. The microphone
// is a file here (`--use-file-for-fake-audio-capture`): silence, then something with the level
// and rhythm of a voice. The gate first learns how loud Buddy's echo is (silence, in a browser
// without speakers), then hears her voice clearly above it for long enough, and stops him —
// long before his 20-second reply would have ended.
//
// Once per phone size and colour scheme, each with a learner of her own: the speaking and the
// barged-in state are shot in a conversation that holds exactly one exchange (a turn does not
// survive the walkthrough's resize or scheme switch — the full-screen modal remounts).

import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { PHONES, shot } from './fit';
import { recordPerf } from './perf';
import { FIXTURES, onboardTalker, REPLY, sayOneThing, voiceAsSilence, voiceFile } from './talk';

/** Her voice sets in this long after the ear opens: time for the speaking state's shot. */
const QUIET_MS = 6000;
const MIC = voiceFile(join(FIXTURES, 'barge-voice.wav'), QUIET_MS, 4000);

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

for (const phone of PHONES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`she talks over Buddy: he stops and listens (${phone.width}, ${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize(phone);
      await onboardTalker(page, `barge-${phone.width}-${scheme}`);
      // The scheme turns once she is in, before the turn starts: app.json starts the app
      // light (`userInterfaceStyle`), and the palette follows the system from its change on.
      await page.emulateMedia({ colorScheme: scheme });
      await voiceAsSilence(page, 20_000);

      await sayOneThing(page, true);
      await expect(page.getByText(REPLY).last()).toBeVisible();
      await expect(page.getByText('Buddy spricht …')).toBeVisible();
      const speaking = Date.now();
      // Only once the ear really hears does the screen say she can just talk (rule 5).
      await expect(page.getByText('Sprich einfach dazwischen, dann hört er dir zu.')).toBeVisible();
      // `shot` names the 360 one itself (…-360.png).
      await shot(page, `34-talk-speaking-${scheme}`, { phones: [phone] });
      await expect(page.getByText('Buddy spricht …')).toBeVisible();

      // Her voice comes in: he stops long before his 20 s are over, and the mic runs.
      await expect(page.getByText('Ich höre zu.')).toBeVisible({ timeout: 15_000 });
      const stoppedAfter = Date.now() - speaking;
      // …and not before her voice: the file opens with QUIET_MS of silence for each stream it
      // feeds (measured with 3 s: he stopped 3.9 s in — her voice plus the gate's 300 ms, plus
      // the screen).
      expect(stoppedAfter).toBeGreaterThan(QUIET_MS - 1000);
      expect(stoppedAfter).toBeLessThan(QUIET_MS + 6000);
      await expect(page.getByText('Buddy spricht …')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Aufnahme stoppen' })).toBeVisible();
      // Not the end of his reading: the loop's own re-listen never started (that one is `relisten`).
      const spans = await recordPerf(page, 'talk-barge');
      expect(spans.map((s) => s.action)).not.toContain('relisten');
      await shot(page, `35-talk-barged-in-${scheme}`, { phones: [phone] });

      // What she said next is a normal turn.
      await page.getByRole('button', { name: 'Aufnahme stoppen' }).click();
      await expect(page.getByText('Was steht diese Woche an?').last()).toBeVisible();
      await page.getByRole('button', { name: 'Beenden' }).last().click();
      await expect(page.getByText('LearnBuddy')).toBeVisible();
    });
  }
}
