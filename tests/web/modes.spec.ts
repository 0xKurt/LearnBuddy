// Browser walkthrough of the learning modes (after core-loop.spec.ts, same dev
// stack; scripted answers in apps/api/src/testing/scenarios/learning-modes.ts):
// "Erklär mir …", homework help with hints only, practice without a photo with
// math and a figure, a practice test (no hints, results at the end) and
// "die wackligen nochmal". Screenshots go to test-results/web/shots.

import { expect, test, type Page } from '@playwright/test';

import { bottomStack, shot } from './fit';
import { recordPerf } from './perf';

/** The button inside the sheet that is open (the thread behind it may show the same words). */
function inSheet(page: Page) {
  return page.locator('[aria-modal="true"]');
}

/** The card on top (a finished practice, a waiting photo) lies over the ways to start. */
async function closeCardIfAny(page: Page): Promise<void> {
  const card = page.getByTestId('home-card');
  if ((await card.count()) === 0) return;
  await page.getByRole('button', { name: 'Karte ausblenden' }).first().click();
  await expect(card).toHaveCount(0);
}

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`modes-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  // The hand-over: what is set, then the phone goes to the child (user feedback #10).
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  // The three first-start cards (app/onboarding.tsx) come before the home.
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('Hallo Lena')).toBeVisible();
}

test('learning modes: explain, homework help without the solution, practice with math', async ({
  page,
}) => {
  await onboardChild(page);
  // No tiles or lists: Buddy, and the ways to start above the field.
  await expect(page.getByRole('button', { name: 'Vokabeln', exact: true })).toBeVisible();
  await expect(page.getByText('Was willst du machen?')).toHaveCount(0);
  await shot(page, '20-home-start-row');

  // ── "Erklär mir den Dativ" → the explanation is the answer, practice is offered ──
  // (owner decision 28.09.: explaining happens in the chat, never behind a button).
  await page.getByLabel('Schreib Buddy …').fill('erklär mir den dativ');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Wem gebe ich den Knochen?', { exact: false })).toBeVisible();
  await shot(page, '21-explain-in-chat');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await page.getByRole('button', { name: 'Wem?', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  // Nothing stands between the solution and "Weiter" after a clean first try: the three ways
  // to re-explain cost half a screen there and nobody needs them (owner 28.09., issue #61).
  // She can still ask Buddy in the chat, and after a wrong try they are right there.
  await expect(page.getByRole('button', { name: 'Einfacher bitte' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Weiter' }).click();
  // A fill-in sentence: the gap is drawn, and her answer appears in it while she types.
  await expect(page.getByLabel(/Ich helfe Lücke Mutter/)).toBeVisible();
  await page.getByLabel('Deine Antwort').fill('der');
  await expect(page.getByLabel(/Lücke, darin: der/)).toBeVisible();
  // A longer answer makes the gap grow instead of being cut inside it: "die lösung passt gar
  // nicht voll ins feld oben. in den fällen muss das feld mitwachsen" (owner 28.09., #62).
  const blank = page.getByTestId('blank').first();
  const narrow = (await blank.boundingBox())?.width ?? 0;
  await page.getByLabel('Deine Antwort').fill('meiner lieben');
  await expect(page.getByLabel(/Lücke, darin: meiner lieben/)).toBeVisible();
  const grown = (await blank.boundingBox())?.width ?? 0;
  expect(grown, `the gap grows with the answer (${narrow} → ${grown}pt)`).toBeGreaterThan(narrow);
  await page.getByLabel('Deine Antwort').fill('der');
  await expect(page.getByLabel(/Lücke, darin: der/)).toBeVisible();
  // The focus ring is the answer pill's, not the browser's black box around the bare field.
  expect(
    await page.getByLabel('Deine Antwort').evaluate((el) => getComputedStyle(el).outlineWidth),
  ).toBe('0px');
  await shot(page, '22-fill-blank');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Alles saß gleich beim ersten Mal', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Homework help: hints only, no "show solution", solved by herself ──
  await closeCardIfAny(page);
  await page.getByRole('button', { name: 'Hausaufgabe', exact: true }).click();
  await page.getByRole('button', { name: 'Aufgabe eintippen' }).click();
  await expect(page.getByText('Welche Aufgabe? Schreib sie ab.')).toBeVisible();
  // A sheet takes the keyboard with it (issue #73): the first Tab lands inside it, not
  // somewhere on the screen behind it.
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => !!document.activeElement?.closest('[aria-modal="true"]')),
    'focus after opening a sheet',
  ).toBe(true);
  await page
    .getByRole('textbox')
    .last()
    .fill('Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt.');
  await inSheet(page).getByRole('button', { name: "Los geht's" }).click();
  await expect(
    page.getByText('Hausaufgabe – ich gebe dir Tipps, die Lösung findest du selbst.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lösung zeigen' })).toHaveCount(0);
  // "Tipp" is there in homework too (user feedback #7); one task: nothing to set aside.
  await expect(page.getByRole('button', { name: 'Einen Tipp bekommen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Später' })).toHaveCount(0);
  await page.getByLabel('Deine Antwort').fill('keine Ahnung');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Welche zwei Längen kennst du vom Rechteck?')).toBeVisible();
  await page.getByLabel('Deine Antwort').fill('11');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText(/Länge .*mal.* Breite/)).toBeVisible();
  await shot(page, '23-homework-hints');
  // Typed math is previewed as it will be read.
  await page.getByLabel('Deine Antwort').fill('3/4');
  await expect(page.getByLabel('Vorschau deiner Antwort: 3 durch 4')).toBeVisible();
  // The worst case of the pinned bar: math keys (the field has focus), the preview under
  // the pill, "Prüfen". What it takes, the question loses on a small phone with the
  // keyboard open — help is a chip in the conversation, not a row down here (issue #16).
  await page.setViewportSize({ width: 360, height: 740 });
  const stack = await bottomStack(page, 'practice-typed-math');
  expect(stack, `pinned bar ${stack}pt`).toBeLessThanOrEqual(200);
  await expect(page.getByText('Welche zwei Längen kennst du vom Rechteck?')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Frage passt nicht' })).toHaveCount(0);
  await page.getByLabel('Deine Antwort').fill('28');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Selbst gelöst!', { exact: true })).toBeVisible();
  await expect(page.getByText('Stark – das hast du selbst gelöst!')).toBeVisible();
  await shot(page, '24-homework-solved');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Hausaufgabe geschafft')).toBeVisible();
  // What she solved herself — no hit rate, no zero (user feedback #1).
  // On the screen she is looking at: the home lies behind it in the DOM and carries the same
  // sentence on its result card (that duplication is #17, not this test's subject).
  await expect(
    page.getByTestId('scroll-list').getByText('Du hast 1 Aufgabe selbst gelöst.'),
  ).toBeVisible();
  await expect(page.getByText('Auf Anhieb richtig')).toHaveCount(0);
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Practice without a photo: fractions drawn, math rendered ──
  // Said to Buddy instead of picking a tile: Buddy answers with a start button.
  await page.getByLabel('Schreib Buddy …').fill('Ich will Brüche vergleichen üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByText('ein paar Fragen zu Brüchen vorbereitet', { exact: false }),
  ).toBeVisible();
  // The offer card in the thread, not a sheet: its button is the newest one.
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Frage von Buddy')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Frage passt nicht' })).toBeVisible();
  // "Tipp": the next prepared hint at once — no model involved. The hints are written
  // in the background right after the start; give that a moment in the dev stack.
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Einen Tipp bekommen' }).click();
  await expect(page.getByText('Schau auf die Kreise: Welcher ist mehr gefüllt?')).toBeVisible();
  // What scrolls up out of the conversation fades away instead of being cut hard under the
  // question card, where half a line stood readable and looked like a rendering fault
  // (owner 28.09., issue #63). On the web the scroll view itself is masked (EdgeFade.tsx);
  // on phones the same edge is covered by <TopEdgeFade>, which a screenshot has to show.
  const faded = await page.getByTestId('scroll-thread').evaluate((el) => {
    let node: Element | null = el;
    while (node) {
      const s = getComputedStyle(node);
      const mask = `${s.getPropertyValue('mask-image')} ${s.getPropertyValue('-webkit-mask-image')}`;
      if (mask.includes('gradient')) return true;
      node = node.parentElement;
    }
    return false;
  });
  expect(faded, 'the conversation fades out at its top edge').toBe(true);
  await shot(page, '25-practice-fractions');

  // ── Voice mode: switched on in the practice header, still on at Buddy ──
  // (Recording can't run in headless Chromium; this checks the controls and the layout.)
  const voiceSwitch = page.getByRole('switch', { name: 'Sprachmodus' }).last();
  await expect(voiceSwitch).toHaveAttribute('aria-checked', 'false');
  // Multiple choice: the mic only joins the options in voice mode.
  await expect(page.getByRole('button', { name: 'Antwort sagen' })).toHaveCount(0);
  await voiceSwitch.click();
  await expect(voiceSwitch).toHaveAttribute('aria-checked', 'true');
  const explained = page.getByText('Ich lese dir vor. Tipp einmal aufs Mikro', { exact: false });
  await expect(explained).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nochmal vorlesen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Antwort sagen' })).toHaveCount(1);
  await expect(explained).toBeHidden({ timeout: 8000 });
  await shot(page, '27-practice-voice-mode');
  await page.getByRole('button', { name: 'Übung beenden' }).click();
  await expect(page.getByText('Hallo Lena')).toBeVisible();
  // Still in voice mode at Buddy: the bar is voice-first (keyboard · big mic · photo),
  // and the home has the same switch (audit M-77).
  const homeSwitch = page.getByRole('switch', { name: 'Sprachmodus' }).last();
  await expect(homeSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Tastatur' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nachricht sprechen' })).toBeVisible();
  await shot(page, '26-buddy-voice-mode');
  // "Tastatur" goes back to typing.
  await page.getByRole('button', { name: 'Tastatur' }).click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
  await expect(homeSwitch).toHaveAttribute('aria-checked', 'false');
  // Switched on from the home itself, and off again.
  await homeSwitch.click();
  await expect(homeSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Nachricht sprechen' })).toBeVisible();
  await homeSwitch.click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
  // Off again: "Ich lese dir vor …" no longer holds, so it does not stay on screen.
  await expect(explained).toHaveCount(0);

  // ── Practice test: no verdicts or solutions until the end ──
  await page.getByLabel('Schreib Buddy …').fill('Mach einen Probetest über die Römer');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('ein Probetest über die Römer', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(
    page.getByText('Probetest – eine Antwort pro Frage, keine Tipps.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lösung zeigen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Augustus', exact: true }).click();
  await expect(page.getByText("Notiert – weiter geht's.")).toBeVisible();
  await expect(page.getByText('Richtig', { exact: true })).toHaveCount(0);
  await shot(page, '28-test-noted');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  // The last question stays until "Weiter" (the test is finished by then, so its solution shows).
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Probetest geschafft!')).toBeVisible();
  await expect(page.getByText('1 · Richtig')).toBeVisible();
  await expect(page.getByText('2 · Übersprungen')).toBeVisible();
  await expect(page.getByText('Lösung: 753')).toBeVisible();
  await shot(page, '29-test-review');

  // ── One tap: the shaky topics again ──
  await page.getByRole('button', { name: 'Die wackligen nochmal üben' }).click();
  await expect(page.getByText('Wer gründete Rom der Sage nach?')).toBeVisible();
  await page.getByRole('button', { name: 'Übung beenden' }).click();
  await expect(page.getByText('Hallo Lena')).toBeVisible();

  // ── Any part of the app, by just asking Buddy ──
  await page.getByLabel('Schreib Buddy …').fill('Zeig mir meine Arbeitsblätter');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Klar – hier ist dein Stoff.')).toBeVisible();
  await shot(page, '31-open-area');
  await page.getByRole('button', { name: 'Materialien öffnen' }).click();
  await expect(page.getByRole('heading', { name: 'Materialien' })).toBeVisible();
  await page.getByRole('button', { name: 'Zurück' }).click();

  // ── Conversation mode: she speaks, Buddy answers aloud, in the same conversation ──
  // (A fake microphone; in the browser there is no pause detection, so she taps when done.)
  await page.getByRole('button', { name: 'Mit Buddy sprechen' }).click();
  await expect(page.getByText('GESPRÄCH')).toBeVisible();
  await expect(page.getByText('Ich höre zu.')).toBeVisible();
  await expect(page.getByText('Tipp aufs Mikro, wenn du fertig bist.')).toBeVisible();
  await shot(page, '32-talk-listening');
  await page.waitForTimeout(1500);
  const streamed = page.waitForResponse((r) => r.url().endsWith('/v1/buddy/messages'));
  await page.getByRole('button', { name: 'Aufnahme stoppen' }).click();
  // Buddy's reply comes as a stream (shown while it is written, read aloud once stored).
  expect((await streamed).headers()['content-type']).toContain('text/event-stream');
  // Her words stand as her own bubble in the one thread (issue #18) — the chat
  // underneath carries it too, so the last one is the talk screen's.
  await expect(page.getByText('Was steht diese Woche an?').last()).toBeVisible();
  // The answer on the conversation screen (the chat underneath has it too).
  await expect(
    page.getByText('Diese Woche steht noch nichts an – magst du etwas üben?').last(),
  ).toBeVisible();
  await shot(page, '33-talk-answer');
  await page.getByRole('button', { name: 'Beenden' }).last().click();
  await expect(page.getByText('Hallo Lena')).toBeVisible();
  // The same conversation: what was said by voice is in the chat.
  await expect(page.getByText('Was steht diese Woche an?')).toBeVisible();

  // What the app's own stopwatch measured on the way (issue #66): starting an offered
  // practice and checking an answer are the two taps the owner called slow.
  await recordPerf(page, 'modes');
});
