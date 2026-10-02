// Browser walkthrough of the learning modes (after core-loop.spec.ts, same dev
// stack; scripted answers in apps/api/src/testing/scenarios/learning-modes.ts):
// "Erklär mir …", homework help with hints only, practice without a photo with
// math and a figure, a practice test (no hints, results at the end) and
// "die wackligen nochmal", and a written calculation path checked step by step.
// Screenshots go to test-results/web/shots.

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { bottomStack, partHeight, PHONES, settle, shot, SHOTS } from './fit';
import { recordPerf } from './perf';

/** The button inside the sheet that is open (the thread behind it may show the same words). */
function inSheet(page: Page) {
  return page.locator('[aria-modal="true"]');
}

/**
 * The bar on top (a paused practice, a waiting photo) floats over the ways to start.
 * Right after leaving a practice the home may still show the stale bar until the fresh
 * state arrives, and a result never has one (issue #17) — the bar leaving on its own is
 * as good as closing it, so a missed click is not a failure; the empty check below is.
 */
async function closeCardIfAny(page: Page): Promise<void> {
  const card = page.getByTestId('home-card');
  if ((await card.count()) === 0) return;
  await page
    .getByRole('button', { name: 'Karte ausblenden' })
    .first()
    .click({ timeout: 3000 })
    .catch(() => undefined);
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
  // The Bundesland is a required field at registration (issue #199): one row that opens
  // a sheet with the sixteen; without a choice the CTA stays muted.
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
  // The hand-over: what is set, then the phone goes to the child (user feedback #10).
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  // The first-start cards (app/onboarding.tsx) come before the home; the last one is the
  // colour choice (issue #136). Skipping them keeps the default palette.
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

test('learning modes: explain, homework help without the solution, practice with math', async ({
  page,
}) => {
  await onboardChild(page);
  // No tiles or lists: Buddy, his name, and one way into everything else (issue #174).
  await expect(page.getByText('Was willst du machen?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vokabeln', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
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
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
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
  // Typed math is previewed as it will be read — named, not divided (issue #175).
  await page.getByLabel('Deine Antwort').fill('3/4');
  await expect(page.getByLabel('Vorschau deiner Antwort: 3 Viertel')).toBeVisible();
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
  const starts = page.getByRole('button', { name: "Los geht's" });
  const startsBefore = await starts.count();
  await page.getByLabel('Schreib Buddy …').fill('Ich will Brüche vergleichen üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByText('ein paar Fragen zu Brüchen vorbereitet', { exact: false }),
  ).toBeVisible();
  // The offer card in the thread, not a sheet: its button is the newest one — but it renders a
  // frame AFTER Buddy's text, and `.last()` does not wait for a match it already has. Waiting
  // for the text alone and then taking `.last()` clicked the PREVIOUS offer about one run in
  // two, and the app opened that older session instead (seen 02.10.2026, issue #267). Waiting
  // for the count makes the newest button the one that exists.
  await expect(starts).toHaveCount(startsBefore + 1);
  await starts.last().click();
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
  // .last(): the home under this screen keeps its own thread mounted (expo-router).
  const faded = await page
    .getByTestId('scroll-thread')
    .last()
    .evaluate((el) => {
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
  // The drawing takes the measured room of the grown question card (issue #96) — more
  // than the old fixed 14 % of the window (118 pt inside a ~144 pt frame) ever allowed.
  const fig = await partHeight(page, 'question-figure', '25-practice-fractions');
  expect(fig, `figure ${fig}pt`).toBeGreaterThan(150);

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
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  // Still in voice mode at Buddy: the bar is voice-first (keyboard · big mic · photo).
  await expect(page.getByRole('button', { name: 'Tastatur' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nachricht sprechen' })).toBeVisible();
  await shot(page, '26-buddy-voice-mode');
  // The speaker is back in the head (issue #181), and this time it says which way it is:
  // a switch with a state, not the bare symbol #52 took out. Its name IS its state.
  const readAloudOn = page.getByRole('switch', { name: 'Vorlesen ist an' });
  const readAloudOff = page.getByRole('switch', { name: 'Antworten vorlesen' });
  await expect(readAloudOn).toHaveAttribute('aria-checked', 'true');
  // And it is no longer a second place to look.
  await page.getByRole('button', { name: 'Mehr' }).click();
  await expect(page.getByRole('button', { name: 'Vorlesen ist an' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Schließen' }).click();
  // "Tastatur" goes back to typing — and it is the SAME state, so the head follows it.
  await page.getByRole('button', { name: 'Tastatur' }).click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
  await expect(readAloudOff).toHaveAttribute('aria-checked', 'false');
  // On and off again from the head itself, one tap each way.
  await readAloudOff.click();
  await expect(page.getByRole('button', { name: 'Nachricht sprechen' })).toBeVisible();
  await readAloudOn.click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
  // Off again: "Ich lese dir vor …" no longer holds, so it does not stay on screen.
  await expect(explained).toHaveCount(0);

  // ── Bruchbalken: a surface she WORKS with, not one more sentence (issue #162) ──
  // The scripted model said only three tasks and their whole numbers (there is no field in
  // which it could say more); every word, every bar and every key here is the server's.
  await page.getByLabel('Schreib Buddy …').fill('Zeig mir Bruchbalken zum Üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Bruchbalken zum Ausprobieren', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  // The question code wrote from the task: one half, on a bar of quarters.
  await expect(page.getByText('Färbe', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('0 von 4 Teilen gefärbt')).toBeVisible();
  // Four real touch targets, each with a name (a screen reader can shade the bar too).
  await expect(page.getByRole('button', { name: 'Teil 1 von 4' })).toBeVisible();
  // Shading three quarters, then taking one back — the whole point is that she can change
  // her mind before anything is judged.
  await page.getByRole('button', { name: 'Teil 3 von 4' }).click();
  await expect(page.getByText('3 von 4 Teilen gefärbt')).toBeVisible();
  await page.getByRole('button', { name: 'Teil 2 von 4' }).click();
  await expect(page.getByText('2 von 4 Teilen gefärbt')).toBeVisible();
  await shot(page, '34-fraction-bar-shade');
  // What she shaded stands in the answer field, so "Prüfen" is the same one way to a
  // verdict as everywhere else — and typing is still right there next to it.
  await expect(page.getByLabel('Deine Antwort')).toHaveValue('2/4');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  // 2/4 for a question that named 1/2: the same amount, and a rule says so without a model.
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // "1/2 + 1/4" — the sentence the issue opens with, and the only shape with both: the two
  // addends DRAWN above the question (the figure, where the connection is visible at a
  // glance) and the empty bar under it she shades. The tallest of the three, so this is the
  // one that proves it fits 360×740.
  await expect(page.getByText('Rechne', { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId('question-figure')).toBeVisible();
  await page.getByRole('button', { name: 'Teil 3 von 4' }).click();
  await expect(page.getByText('3 von 4 Teilen gefärbt')).toBeVisible();
  await shot(page, '35-fraction-bar-add');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Two bars of the same length: comparing is seeing, and the answer is one tap.
  await expect(page.getByRole('button', { name: 'ein Halb wählen' })).toBeVisible();
  await shot(page, '36-fraction-bar-compare');
  await page.getByRole('button', { name: '3 Fünftel wählen' }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  // That was the last question: the server finished the session, so "Weiter" leads to the
  // summary rather than to another bar.
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();

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
  // Skipped: here the solution says something new, so its card stays (issue #93).
  await expect(page.getByText('Lösung', { exact: true })).toBeVisible();
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
  await expect(page.getByText('LearnBuddy')).toBeVisible();

  // ── Any part of the app, by just asking Buddy ──
  await page.getByLabel('Schreib Buddy …').fill('Zeig mir meine Arbeitsblätter');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Klar – hier ist dein Stoff.')).toBeVisible();
  await shot(page, '31-open-area');
  await page.getByRole('button', { name: 'Dein Material öffnen' }).click();
  await expect(page.getByRole('heading', { name: 'Dein Material' })).toBeVisible();
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
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  // The same conversation: what was said by voice is in the chat.
  await expect(page.getByText('Was steht diese Woche an?')).toBeVisible();

  // What the app's own stopwatch measured on the way (issue #66): starting an offered
  // practice and checking an answer are the two taps the owner called slow.
  await recordPerf(page, 'modes');
});

/**
 * The keyboard as close as the web gets: the window shrinks by its height, as Android does
 * on its own (adjustResize, issue #46). An iPhone keyboard with its suggestion bar is about
 * 336 pt; a small Android one about 300 dp.
 */
const KEYBOARD = { 390: 336, 360: 300 } as const;

/**
 * The path at both phone sizes, light and dark, without and with the keyboard up. The field
 * gets the focus back for each pass (the contrast check in `shot` may move it): the keyboard
 * and the math keys only show while she is typing.
 */
async function pathShots(page: Page, name: string): Promise<void> {
  const field = page.getByLabel('Deine Antwort');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await field.focus();
    // Fit and contrast at the full size of both phones (fit.ts), then the keyboard state.
    await shot(page, `${name}-${scheme}`);
    for (const phone of PHONES) {
      const room = { width: phone.width, height: phone.height - KEYBOARD[phone.width] };
      await page.setViewportSize(room);
      await field.focus();
      await expect(page.getByRole('button', { name: 'Neue Zeile' })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: join(SHOTS, `${name}-${scheme}-kb-${phone.width}.png`) });
      // With the keyboard up the task still shows above the pinned bar.
      await expect(page.getByTestId('scroll-question').last()).toBeInViewport();
      const stack = await bottomStack(page, `${name}-${scheme}-kb`);
      expect(stack, `pinned bar with a three-line path ${stack}pt`).toBeLessThanOrEqual(
        room.height / 2,
      );
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize(PHONES[0]);
}

test('a written path: three lines in, the first broken step named (issue #221)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Ich will Gleichungen mit Rechenweg üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByText('Gleichungen mit Rechenweg vorbereitet', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Löse:', { exact: false }).first()).toBeVisible();

  // The math keys come with the keyboard, and their first key starts a new line.
  const field = page.getByLabel('Deine Antwort');
  await field.click();
  const newLine = page.getByRole('button', { name: 'Neue Zeile' });
  await expect(newLine).toBeVisible();
  await field.pressSequentially('2x + 3 = 7');
  await newLine.click();
  await expect(field).toBeFocused();
  await field.pressSequentially('2x = 10');
  // Inside a path the return key starts the next line instead of sending the first one.
  await field.press('Enter');
  await field.pressSequentially('x = 5');
  await expect(field).toHaveValue('2x + 3 = 7\n2x = 10\nx = 5');
  // The web field shows all three lines, not one row that scrolls.
  const rows = await field.evaluate((el) => {
    const s = getComputedStyle(el);
    const inner = el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
    return Math.round(inner / parseFloat(s.lineHeight));
  });
  expect(rows, 'the field grows to the three lines').toBeGreaterThanOrEqual(3);
  await pathShots(page, '37-path-typed');

  // "Prüfen" sends every line, separated exactly as steps.ts splits them.
  const sent = page.waitForRequest((r) => r.url().endsWith('/answer') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  expect((await sent).postDataJSON()).toMatchObject({ text: '2x + 3 = 7\n2x = 10\nx = 5' });
  // Code found the step: 2x + 3 = 7 → 2x = 10 is the first one that does not follow.
  await expect(
    page
      .getByText('Bis Zeile 1 stimmt alles. Von dort zur nächsten Zeile geht etwas verloren', {
        exact: false,
      })
      .last(),
  ).toBeVisible();
  await pathShots(page, '38-path-broke');

  // She writes it again; a sound path is judged on the value it arrives at.
  // pathShots ends by switching the colour scheme back, and a scheme change rebuilds the
  // tree: a fill that lands during that rebuild is wiped, the pill shows the mic instead of
  // "Prüfen", and the click waits until the test times out (CI, 02.10.2026). Fill until
  // the field holds the path, then check.
  const corrected = '2x + 3 = 7\n2x = 4\nx = 2';
  await expect(async () => {
    await field.fill(corrected);
    await expect(field).toHaveValue(corrected, { timeout: 1000 });
  }).toPass();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // A one-liner still goes out with the return key: the quick path stays quick.
  await expect(page.getByText('Berechne', { exact: false }).first()).toBeVisible();
  await field.fill('12');
  const quick = page.waitForRequest((r) => r.url().endsWith('/answer') && r.method() === 'POST');
  await field.press('Enter');
  expect((await quick).postDataJSON()).toMatchObject({ text: '12' });
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
});
