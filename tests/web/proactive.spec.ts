// Proactive, measured on a network that is not localhost (issue #59). The walkthrough's API is on
// the same machine, so every request answers in milliseconds and nothing prepared ahead could
// show its worth. Here every request pays a round trip (Chrome's network emulation, LATENCY_MS —
// conservative: on the phone a turn waits ~1.2 s more than the server takes, #169), and the clock
// is Playwright's own, so the same spec measures any build the same way.
//
// - "Los geht's" on Buddy's offer → its first question on screen: budget 1 s (issue #59).
// - With Buddy's own voice (LB_DEV_SPEECH=fake): is the next question's first audio already
//   fetched when she taps "Weiter"? Before #59 it was requested only then.
//
// Numbers go to test-results/web/perf.jsonl (name 'proactive'); docs/speed-audit.md has them.

import { expect, test, type Page } from '@playwright/test';

import { recordPerf } from './perf';

const LATENCY_MS = 300;
const SPEECH = process.env.LB_DEV_SPEECH === 'fake';
/** Only measure, don't judge: the same spec runs against an older build for the "before". */
const MEASURE_ONLY = process.env.LB_MEASURE_ONLY === '1';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`proactive-${Date.now()}@example.test`);
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
  await page.getByLabel('Jahr', { exact: true }).fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

test('an offered practice opens at once, and the next question is ready to be heard', async ({
  page,
}) => {
  await onboardChild(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: LATENCY_MS,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  // Every request for Buddy's voice, with what it asked to be said and when it was answered.
  const speech: Array<{ text: string; answeredAt: number }> = [];
  page.on('response', (r) => {
    if (!r.url().endsWith('/v1/voice/speech')) return;
    const body = r.request().postDataJSON() as { text?: string } | null;
    speech.push({ text: body?.text ?? '', answeredAt: Date.now() });
  });

  await page.getByLabel('Schreib Buddy …').fill('erklär mir den dativ');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Wem gebe ich den Knochen?', { exact: false })).toBeVisible();
  // She reads Buddy's answer for a moment — the time Buddy has to prepare.
  if (MEASURE_ONLY) await page.waitForTimeout(5000);
  else await expect(page.getByText('Liegt bereit', { exact: true })).toBeVisible();

  const tap = Date.now();
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByRole('button', { name: 'Wem?', exact: true })).toBeVisible();
  const startOffer = Date.now() - tap;

  const spans: Array<{ action: string; ms: number }> = [
    { action: 'pw_start_offer', ms: startOffer },
  ];
  if (SPEECH) {
    // Voice mode on in the practice: each question is read, and while she answers the first
    // one, the second one's first sentence is fetched.
    await page.getByRole('switch', { name: 'Sprachmodus' }).last().click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Wem?', exact: true }).click();
    await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    const weiter = Date.now();
    await page.getByRole('button', { name: 'Weiter' }).click();
    await expect(page.getByLabel(/Ich helfe Lücke Mutter/)).toBeVisible();
    // The audio of the new question: answered when, relative to "Weiter"?
    const nextAudio = await expect
      .poll(() => speech.find((s) => /helfe/.test(s.text)), { timeout: 10_000 })
      .toBeDefined()
      .then(() => speech.find((s) => /helfe/.test(s.text))!);
    spans.push({ action: 'pw_next_question_audio_ready', ms: nextAudio.answeredAt - weiter });
  }
  await recordPerf(page, 'proactive');
  const { appendFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  appendFileSync(
    join(__dirname, '../../test-results/web/perf.jsonl'),
    `${JSON.stringify({ name: 'proactive-wall', latency_ms: LATENCY_MS, spans })}\n`,
  );
  console.log(`PROACTIVE ${JSON.stringify(spans)}`);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });

  if (!MEASURE_ONLY) {
    // Budget of issue #59: under 1 s, when Buddy offered it.
    expect(startOffer, `"Los geht's" → first question took ${startOffer} ms`).toBeLessThan(1000);
    if (SPEECH) {
      const ready = spans.find((s) => s.action === 'pw_next_question_audio_ready')!;
      expect(ready.ms, 'the next question was heard-ready before "Weiter"').toBeLessThanOrEqual(0);
    }
  }
});
