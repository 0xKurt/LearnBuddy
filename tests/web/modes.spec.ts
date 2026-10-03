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

/** The words every offer card's button carries (components/learn/OfferCard.tsx). */
const START = "Los geht's";

/**
 * The start button of the offer whose card says `says`.
 *
 * Not "the newest `Los geht's`", and that cost two runs to learn (issue #267). The thread keeps
 * every earlier offer, and the new one renders a frame AFTER Buddy's words — so `.last()` after
 * waiting for the text clicked the PREVIOUS offer about one run in two, and counting the buttons
 * first raced the other way: the earlier offers also render after the composer does, so the
 * baseline came out too low and the expected count was never reached.
 *
 * Scoping to the card that carries the offer's own words needs neither a count nor a timing
 * assumption. `.last()` over the divs that both contain those words and hold a start button is
 * the INNERMOST such div — the card itself — because an ancestor always precedes its child in
 * document order.
 */
function offerStart(page: Page, says: string) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: START }) })
    .filter({ hasText: says })
    .last()
    .getByRole('button', { name: START });
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

  // ── Der Rechenweg wird in der App getippt, nicht nur von den Tests geschickt (issue #221) ──
  // #209 checks a path line by line, but the field allowed line breaks only for a long answer —
  // so on the phone the return key sent the FIRST line as the whole answer. The ↵ key in the math
  // row is what starts the next line; on this 360×740 screen, with the keyboard row open.
  const answer = page.getByLabel('Deine Antwort');
  await answer.click();
  await answer.fill('7');
  // The first time any key of the row is tapped in a browser, and that is its own finding
  // (issue #271): a tap took the focus out of the field, the row hid itself between mousedown and
  // mouseup, and the tap never counted. Several taps in a row, because one alone looked fine.
  const times = page.getByRole('button', { name: 'mal', exact: true });
  await expect(times).toBeVisible();
  await times.click();
  await page.keyboard.type('4');
  await expect(answer).toHaveValue('7·4');
  const newline = page.getByRole('button', { name: 'neue Zeile' });
  await expect(newline).toBeVisible();
  await newline.click();
  await page.keyboard.type('28+1');
  await newline.click();
  await page.keyboard.type('29');
  await expect(answer).toHaveValue('7·4\n28+1\n29');
  // The row stood through all four taps — it is what she types with.
  await expect(times).toBeVisible();
  // What the return key does on the PHONE is not provable here: react-native-web (0.21.2) knows no
  // `submitBehavior` and never routes Enter to `onSubmitEditing` on a multiline field. In the
  // browser the field applies the same rule through `onKeyPress` (the "Rechenweg" step further
  // down sends a one-liner with Enter); the rule itself is pinned in
  // `apps/mobile/lib/practice/pathEntry.ts`'s unit tests, and that it reaches the phone's keyboard
  // is unverified until a device run (issue #221).
  await shot(page, '23b-worked-path');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  // Code names the first line that no longer follows — 7·4 holds, 28+1 does not follow from it —
  // and it says so without asking a model at all (`steps.ts`, `pathReply`). In HOMEWORK HELP, which
  // is where this stands: the first run of this step got the hint ladder's general question
  // instead, because every fixed near-miss reply was shut out of that mode. A reply that names a
  // line is a hint, not a solution, so it holds here too (issue #274).
  await expect(page.getByText('Bis Zeile 1 stimmt alles', { exact: false })).toBeVisible();
  // A near miss, not a wrong answer: her way is mostly right, so the question stays OPEN — the
  // answer field is still there and so is the hint. Not „Prüfen": that button only exists while
  // something is typed, and the field was emptied when the answer went out.
  await expect(page.getByLabel('Deine Antwort')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Einen Tipp bekommen' })).toBeVisible();
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
  const fractions = 'ein paar Fragen zu Brüchen vorbereitet';
  await page.getByLabel('Schreib Buddy …').fill('Ich will Brüche vergleichen üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText(fractions, { exact: false })).toBeVisible();
  // The offer card in the thread, not a sheet — and the button is taken from THAT card's own
  // words rather than from the order or the number of the buttons (see `offerStart`, issue #267).
  await offerStart(page, fractions).click();
  await expect(page.getByText('Frage von Buddy')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Frage passt nicht' })).toBeVisible();
  // "Tipp": the next prepared hint at once — no model involved. The hints are written
  // in the background right after the start; give that a moment in the dev stack.
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Einen Tipp bekommen' }).click();
  await expect(page.getByText('Schau auf die Kreise: Welcher ist mehr gefüllt?')).toBeVisible();
  // Whole turns only (#286): on the smallest phone, with the drawing in the card, "Tipp, bitte"
  // and the hint are each shown whole or not at all — never half a bubble under the card.
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await settle(page);
    const cut = await page
      .getByTestId('scroll-thread')
      .last()
      .evaluate((el) => {
        const box = el.getBoundingClientRect();
        return Array.from(el.querySelectorAll('[data-testid="thread-turn"]'))
          .map((turn) => turn.getBoundingClientRect())
          .filter((r) => r.bottom > box.top + 1 && r.top < box.bottom - 1)
          .filter((r) => r.top < box.top - 1 || r.bottom > box.bottom + 1)
          .map((r) => `${Math.round(r.top - box.top)}..${Math.round(r.bottom - box.top)}`);
      });
    expect(cut, `turns cut at the conversation's edge on ${phone.width} px`).toEqual([]);
  }
  await page.setViewportSize(PHONES[0]!);
  // What scrolls up out of the conversation fades away instead of being cut hard under the
  // question card, where half a line stood readable and looked like a rendering fault
  // (owner 28.09., issue #63). Since #286 the conversation shows whole turns, so the fade is
  // there exactly when the box holds more than it shows; a conversation that fits whole has
  // no edge to fade. On the web the scroll view itself is masked (EdgeFade.tsx); on phones
  // the same edge is covered by <TopEdgeFade>, which a screenshot has to show.
  // .last(): the home under this screen keeps its own thread mounted (expo-router).
  const edge = await page
    .getByTestId('scroll-thread')
    .last()
    .evaluate((el) => {
      let node: Element | null = el;
      let masked = false;
      while (node) {
        const s = getComputedStyle(node);
        const mask = `${s.getPropertyValue('mask-image')} ${s.getPropertyValue('-webkit-mask-image')}`;
        if (mask.includes('gradient')) masked = true;
        node = node.parentElement;
      }
      return { masked, holdsMore: el.scrollHeight > el.clientHeight + 1 };
    });
  expect(edge.masked, 'the conversation fades out at its top edge exactly when it holds more').toBe(
    edge.holdsMore,
  );
  await shot(page, '25-practice-fractions');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '25b-practice-fractions-night');
  await page.emulateMedia({ colorScheme: 'light' });
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
  // The same moment at night: the voice bar, the reply and the drawing share the room (#286).
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '27b-practice-voice-mode-night');
  await page.emulateMedia({ colorScheme: 'light' });
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

/**
 * The key row at both phone sizes, light and dark, with the field focused (the row only
 * shows while she types) and with the keyboard up. The row is ONE line: nothing of it is
 * cut off and nothing slides sideways (issue #286 finding 5, #239).
 */
async function keyRowShots(page: Page, name: string): Promise<void> {
  const field = page.getByLabel('Deine Antwort');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await field.focus();
    await shot(page, `${name}-${scheme}`);
    for (const phone of PHONES) {
      const room = { width: phone.width, height: phone.height - KEYBOARD[phone.width] };
      await page.setViewportSize(room);
      await field.focus();
      const row = page.getByTestId('math-keys');
      await expect(row).toBeVisible();
      await settle(page);
      await page.screenshot({ path: join(SHOTS, `${name}-${scheme}-kb-${phone.width}.png`) });
      const box = await row.boundingBox();
      expect(box, 'the key row is laid out').not.toBeNull();
      // Inside the screen with the bar's 16 pt on both sides — never past the right edge.
      expect(Math.round(box!.x)).toBeGreaterThanOrEqual(16);
      expect(Math.round(box!.x + box!.width)).toBeLessThanOrEqual(phone.width - 16);
      // Every key inside the row, and none narrower than a touch target.
      for (const key of await row.getByRole('button').all()) {
        const k = await key.boundingBox();
        expect(k!.x + k!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
        expect(Math.round(k!.width)).toBeGreaterThanOrEqual(44);
        expect(Math.round(k!.height)).toBeGreaterThanOrEqual(44);
      }
      // Nothing scrolls sideways.
      expect(await row.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('scroll-question').last()).toBeInViewport();
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize(PHONES[0]);
  await field.focus();
}

// Its own test (like the written path): the learning-modes walk is near its time budget, and an
// order needs only a learner and Buddy.
test('an order: tap in order, tap again to take back (issue #228)', async ({ page }) => {
  await onboardChild(page);

  // ── Reihenfolge: tap in order, tap again to take back (issue #228) ──
  // The scripted model wrote the elements in the right order and nothing else; the server
  // shuffled them, keeps the key and judges the order without a model.
  await page.getByLabel('Schreib Buddy …').fill('Lass mich die Keimung ordnen');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('ordne mal die Keimung', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Bring die Keimung einer Bohne', { exact: false })).toBeVisible();
  const STEP = [
    'Der Samen nimmt Wasser auf und quillt',
    'Die Keimwurzel wächst nach unten',
    'Der Keimstängel streckt sich zum Licht',
    'Die ersten Laubblätter entfalten sich',
  ];
  const open = (text: string) => page.getByRole('button', { name: `${text}, noch ohne Platz` });
  const placed = (text: string, n: number) =>
    page.getByRole('button', { name: `${text}, Platz ${n}` });
  const check = page.getByRole('button', { name: 'Prüfen' });
  // Nothing placed: "Prüfen" waits.
  await expect(check).toBeDisabled();
  await open(STEP[0]!).click();
  await open(STEP[1]!).click();
  await open(STEP[2]!).click();
  await expect(placed(STEP[2]!, 3)).toBeVisible();
  // Changed her mind: tapping place 2 takes it back, and place 3 with it.
  await placed(STEP[1]!, 2).click();
  await expect(open(STEP[1]!)).toBeVisible();
  await expect(open(STEP[2]!)).toBeVisible();
  await open(STEP[1]!).click();
  await open(STEP[3]!).click();
  await open(STEP[2]!).click();
  await shot(page, '37-order-placed');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '37b-order-placed-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  // Code found the place: the first two are right.
  await expect(page.getByText("Bis Schritt 2 stimmt's", { exact: false })).toBeVisible();
  await shot(page, '38-order-feedback');
  // Her order stays; she fixes only the end.
  await placed(STEP[3]!, 3).click();
  await open(STEP[2]!).click();
  await open(STEP[3]!).click();
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // Eight numbers, the most an order may have: it still fits 360×740 without scrolling.
  await expect(page.getByText('Ordne die Zahlen der Größe nach', { exact: false })).toBeVisible();
  for (const n of ['-12', '-3', '0,5', '3 Viertel', '2', '17', '105', '1000']) {
    await page.getByRole('button', { name: `${n}, noch ohne Platz` }).click();
  }
  await shot(page, '39-order-eight');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '39b-order-eight-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await check.click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
});

// Its own test (like the written path): the learning-modes walk is long already, and a table
// needs only a learner and Buddy.
test('a table to fill in: Enter walks the gaps, each cell checked on its own (issue #230)', async ({
  page,
}) => {
  await onboardChild(page);
  // ── Tabelle ausfüllen: type into the gaps, Enter walks on (issue #230) ──
  // A 4×4 two-way table whose totals the server recomputed before storing it, then a number
  // wall. Every cell is checked by code; the reply counts the right ones and names the rest.
  await page.getByLabel('Schreib Buddy …').fill('Lass uns eine Vierfeldertafel ausfüllen');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('eine Vierfeldertafel und danach', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('30 Kinder der 6b', { exact: false })).toBeVisible();
  const tableCheck = page.getByRole('button', { name: 'Prüfen' });
  await expect(tableCheck).toBeDisabled();
  const cell = (name: string) => page.getByLabel(name, { exact: true });
  // Typed like on the phone: a cell, Enter, the next cell.
  await cell('Katze, kein Hund').click();
  await page.keyboard.type('6');
  await page.keyboard.press('Enter');
  await expect(cell('keine Katze, Hund')).toBeFocused();
  await page.keyboard.type('8');
  await page.keyboard.press('Enter');
  await page.keyboard.type('20');
  await page.keyboard.press('Enter');
  // The last one wrong, and still focused: the math keys stand above "Prüfen".
  await page.keyboard.type('17');
  await expect(page.getByRole('toolbar')).toBeVisible();
  await shot(page, '60-table-filled');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '60b-table-filled-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await tableCheck.click();
  await expect(
    page.getByText('3 von 4 Feldern stimmen. Schau nochmal bei „Summe“ / „kein Hund“.'),
  ).toBeVisible();
  await shot(page, '61-table-feedback');
  // What she typed stays; she fixes the one cell.
  await expect(cell('Katze, kein Hund')).toHaveValue('6');
  await cell('Summe, kein Hund').fill('18');
  await tableCheck.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // The number wall: brick on brick, centred.
  await expect(page.getByText('Rechne die Zahlenmauer aus', { exact: false })).toBeVisible();
  await cell('Reihe 1, Stein 1').fill('20');
  await cell('Reihe 2, Stein 2').fill('12');
  await cell('Reihe 3, Stein 1').fill('3');
  await shot(page, '62-table-wall');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, '62b-table-wall-night');
  await page.emulateMedia({ colorScheme: 'light' });
  await tableCheck.click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
});

// Its own test, with its own learner: the main walkthrough above is already near its time

test('zuordnen at its largest: pairs in two columns, things into groups (issue #229)', async ({
  page,
}) => {
  // Its own test: the learning-modes walk is long enough already (the 180 s budget). The scripted
  // tasks are the LARGEST the contract allows, every text near its cap (learning-modes.ts), and
  // every `shot` below fails if the parts would have to be scrolled (`scroll-parts` is not a
  // scroll area fit.ts allows). That is the measurement behind MATCH_* in contracts/structured.ts.
  await onboardChild(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize(PHONES[0]);
  /** Both colour schemes of the same moment; the switch rebuilds the tree, the draft keeps it. */
  const both = async (name: string) => {
    await shot(page, name);
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, `${name}-night`);
    await page.emulateMedia({ colorScheme: 'light' });
  };
  await page.getByLabel('Schreib Buddy …').fill('Lass uns Verfassungsorgane zuordnen');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('ordne mal zu, wer was macht', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Welches Verfassungsorgan hat welche Aufgabe?')).toBeVisible();
  await expect(page.getByText('Tippe links eins an, dann sein Gegenstück rechts.')).toBeVisible();
  const free = (text: string) => page.getByRole('button', { name: `${text}, noch ohne Partner` });
  const pair = async (left: string, right: string) => {
    await free(left).click();
    await expect(page.getByRole('button', { name: `${left}, ausgewählt` })).toBeVisible();
    await free(right).click();
  };
  const check = page.getByRole('button', { name: 'Prüfen' });
  await expect(check).toBeDisabled();
  await both('39b-match-pairs-start');
  await pair('Bundespräsident', 'unterschreibt die neuen Gesetze');
  // The one line of instruction has gone; the pair says itself in words.
  await expect(page.getByText('Tippe links eins an, dann sein Gegenstück rechts.')).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Bundespräsident, Paar 1 mit unterschreibt die neuen Gesetze',
    }),
  ).toBeVisible();
  // Below first, then above: works the other way round too.
  await free('bestimmt die Richtlinien im Bund').click();
  await free('Bundeskanzlerin').click();
  // Two swapped on purpose: Bund and Land.
  await pair('Bundesregierung', 'führt die Gesetze des Landes aus');
  await pair('Landesregierung', 'führt die Gesetze des Bundes aus');
  await both('39c-match-pairs');
  await check.click();
  // Code counted: two of four. Which ones, it says only on a second miss. The reply and the
  // whole board stand on the screen together — that is the case the maxima are measured for.
  await expect(page.getByText('2 von 4 Paaren stimmen schon.')).toBeVisible();
  await expect(page.getByText('2 von 4 Paaren stimmen schon.')).toBeInViewport();
  await both('39e-match-feedback');
  // One tap on a pair dissolves it; she pairs the two again, right this time.
  await page
    .getByRole('button', { name: 'Bundesregierung, Paar 3 mit führt die Gesetze des Landes aus' })
    .click();
  await page
    .getByRole('button', { name: 'Landesregierung, Paar 4 mit führt die Gesetze des Bundes aus' })
    .click();
  await pair('Bundesregierung', 'führt die Gesetze des Bundes aus');
  await pair('Landesregierung', 'führt die Gesetze des Landes aus');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // The most things in the most groups: no scrolling on 360×740, before or after sorting.
  await expect(page.getByText('Wer ist denn zuständig: Stadt, Land, Bund?')).toBeVisible();
  await expect(page.getByText('Tippe oben eins an, dann seine Gruppe.')).toBeVisible();
  const GROUPS: Record<string, string[]> = {
    Stadtverwaltung: ['Laternen planen', 'Friedhof pflegen', 'Kitaplätze geben'],
    Landesverwaltung: ['Polizei aufbauen', 'Unis finanzieren', 'Lehrpläne machen'],
    Bundesverwaltung: ['Armee ausrüsten', 'Verträge machen'],
  };
  const group = (name: string) =>
    page.getByRole('button', { name: new RegExp(`^Gruppe ${name},`) });
  /** A group's row: its name, and what she has put in it (the box is the state). */
  const row = (name: string) =>
    page.locator('[data-testid^="match-group-"]').filter({ has: group(name) });
  // A group only takes something while she holds it.
  await expect(group('Landesverwaltung')).toBeDisabled();
  // The tallest moment of a grouping: everything still above the group rows.
  await both('39f0-match-groups-start');
  // One in, and it stands IN the Stadtverwaltung row; one tap there takes it back out again.
  const sorted = (thing: string, name: string) =>
    row(name).getByRole('button', { name: `${thing}, in ${name}`, exact: true });
  await page
    .getByRole('button', { name: 'Friedhof pflegen, noch in keiner Gruppe', exact: true })
    .click();
  await group('Stadtverwaltung').click();
  await expect(sorted('Friedhof pflegen', 'Stadtverwaltung')).toBeVisible();
  await sorted('Friedhof pflegen', 'Stadtverwaltung').click();
  await expect(
    row('Stadtverwaltung').getByRole('button', { name: /^Friedhof pflegen,/ }),
  ).toHaveCount(0);
  for (const [name, things] of Object.entries(GROUPS)) {
    for (const thing of things) {
      await page
        .getByRole('button', { name: `${thing}, noch in keiner Gruppe`, exact: true })
        .click();
      await group(name).click();
      await expect(sorted(thing, name)).toBeVisible();
    }
  }
  await both('39f-match-groups');
  // The theme switch rebuilt the tree; every element still stands in its group (the draft).
  await expect(sorted('Verträge machen', 'Bundesverwaltung')).toBeVisible();
  await check.click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
});

// Its own test: note lines need only a learner and Buddy (issues #226, #275).
test('note lines: read four, then write one — set with a tap, move with Höher/Tiefer (#275)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Lass uns Noten üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Noten lesen und zum Schluss', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();

  /** Both phones in light, then both in the night palette. */
  const both = async (name: string) => {
    await shot(page, name);
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, `${name}-night`);
    await page.emulateMedia({ colorScheme: 'light' });
  };

  // ── Lesen: the server wrote question, drawing and options from the task ──
  await expect(page.getByText('Wie heißt diese Note?')).toBeVisible();
  await expect(page.getByTestId('question-figure')).toBeVisible();
  await both('70-staff-name-note');
  await page.getByRole('button', { name: 'C', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('Welcher Notenwert ist das?')).toBeVisible();
  await both('71-staff-name-value');
  await page.getByRole('button', { name: 'punktierte Achtelnote', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('Welches Intervall', { exact: false })).toBeVisible();
  await both('72-staff-interval');
  await page.getByRole('button', { name: 'kleine Terz', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  await expect(page.getByText('In welcher Taktart', { exact: false })).toBeVisible();
  await both('73-staff-time');
  await page.getByRole('button', { name: '3/4', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── Schreiben (issue #275): a bar is ONE target; the finger's height picks the line ──
  await expect(page.getByText('Schreibe diese Zeile', { exact: false })).toBeVisible();
  const surface = page.getByTestId('answer-staff');
  const check = page.getByRole('button', { name: 'Prüfen' });
  await expect(check).toBeDisabled();
  await both('74-staff-write-empty');

  // Every control on the surface is a real touch target: ≥ 44 pt both ways, at both widths
  // (CLAUDE.md §Design system). The 11-pt rows of #226 are gone.
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await settle(page);
    for (const target of await surface.getByRole('button').all()) {
      const box = await target.boundingBox();
      const name = await target.getAttribute('aria-label');
      expect(box, `${name} at ${phone.width}`).not.toBeNull();
      expect(box!.height, `${name} at ${phone.width}: height`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${name} at ${phone.width}: width`).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 360, height: 740 });
  await settle(page);

  /** Where a step lies on screen: the drawn staff is centred in the bar, 8 gaps tall (`WRITE_REACH`). */
  const tapAt = async (bar: number, step: number) => {
    const zone = await page.getByTestId(`staff-bar-${bar}`).boundingBox();
    const drawn = await surface.locator('svg').first().boundingBox();
    if (!zone || !drawn) throw new Error('staff not laid out');
    const gap = drawn.height / 8;
    const middle = drawn.y + drawn.height / 2;
    await page.mouse.click(zone.x + zone.width / 2, middle - (step * gap) / 2);
  };
  const bar = (n: number, list: string) =>
    expect(page.getByRole('button', { name: `Takt ${n}: ${list}` })).toBeVisible();

  // E on the first line: one tap, on the line.
  await tapAt(1, -4);
  await bar(1, 'E als Viertelnote');
  // A finger a line too low (F instead of G) is no new attempt: "Höher" moves THAT note.
  await tapAt(1, -3);
  await bar(1, 'E als Viertelnote, F als Viertelnote');
  await both('75-staff-write-moving');
  await page.getByRole('button', { name: 'Höher' }).click();
  await bar(1, 'E als Viertelnote, G als Viertelnote');
  await page.getByRole('radio', { name: 'halbe Note', exact: true }).click();
  await tapAt(1, 0);
  await bar(1, 'E als Viertelnote, G als Viertelnote, H als halbe Note');
  await page.getByRole('radio', { name: 'Viertelnote', exact: true }).click();
  await tapAt(2, -1);
  await page.getByRole('button', { name: 'Viertelpause setzen' }).click();
  await page.getByRole('radio', { name: 'halbe Note', exact: true }).click();
  // On purpose one too high (G instead of F): the check names the place.
  await tapAt(2, 5);
  await bar(2, 'A als Viertelnote, Viertelpause, G als halbe Note');
  await both('76-staff-write-full');
  await check.click();
  await expect(
    page.getByText('Die ersten 5 von 6 Zeichen stimmen', { exact: false }),
  ).toBeVisible();
  await both('77-staff-write-feedback');
  // With Buddy's reply in the conversation, the keys still sit above „Prüfen", not under it:
  // the tightest moment of this screen, on the smallest phone.
  await page.setViewportSize({ width: 360, height: 740 });
  await settle(page);
  const checkTop = (await check.boundingBox())!.y;
  for (const target of await surface.getByRole('button').all()) {
    const box = (await target.boundingBox())!;
    expect(
      box.y + box.height,
      `${await target.getAttribute('aria-label')}: above Prüfen`,
    ).toBeLessThanOrEqual(checkTop);
  }
  // Her line stays; one step down and it is right.
  await page.getByRole('button', { name: 'Tiefer' }).click();
  await bar(2, 'A als Viertelnote, Viertelpause, F als halbe Note');
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await both('78-staff-write-right');
});

/** One state at both phone sizes, light and dark (fit and contrast checked by `shot`). */
async function bothSchemes(page: Page, name: string): Promise<void> {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await shot(page, `${name}-${scheme}`);
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

/**
 * On to the next question. A right answer at the first try may move on by itself; otherwise
 * "Weiter" does — either way the next question's words are what this waits for.
 */
async function nextQuestion(page: Page, words: string): Promise<void> {
  const next = page.getByText(words, { exact: false }).first();
  const weiter = page.getByRole('button', { name: 'Weiter' });
  await expect(next.or(weiter).first()).toBeVisible();
  if (!(await next.isVisible())) await weiter.click();
  await expect(next).toBeVisible();
}

const right = (page: Page) => page.getByText(/^(Richtig|Stimmt – gut gemacht!)$/).last();

test('formulas: a reaction equation typed with the chemistry keys and counted (issue #239)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Ich will Reaktionsgleichungen aufstellen');
  await page.getByRole('button', { name: 'Senden' }).click();
  // Buddy's own words carry the equation drawn: no LaTeX, the arrow read as "reagiert zu".
  await expect(
    page.getByText('links und rechts gleich viele Atome', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('longrightarrow', { exact: false })).toHaveCount(0);
  await expect(page.getByLabel(/reagiert zu/).first()).toBeAttached();
  await bothSchemes(page, '70-formula-buddy');
  await offerStart(page, 'Reaktionsgleichungen vorbereitet').click();
  await expect(page.getByText('Stelle die Reaktionsgleichung auf', { exact: false })).toBeVisible();

  // The chemistry row: lower the index, +, the reaction arrow — no fraction bar, no π.
  const field = page.getByLabel('Deine Antwort');
  await field.click();
  await expect(page.getByRole('toolbar', { name: 'Chemie-Zeichen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bruchstrich' })).toHaveCount(0);
  const key = (name: string) => page.getByRole('button', { name, exact: true });
  await keyRowShots(page, '71-chem-keys-empty');

  await field.pressSequentially('2 H');
  await key('Tiefstellen').click();
  await expect(key('Tiefstellen, eingeschaltet')).toBeVisible();
  await field.pressSequentially('2');
  await key('plus').click();
  await field.pressSequentially('O');
  await key('Tiefstellen').click();
  await field.pressSequentially('2');
  await key('Reaktionspfeil').click();
  await field.pressSequentially('2 H');
  await key('Tiefstellen').click();
  await field.pressSequentially('2O');
  await expect(field).toHaveValue('2 H₂ + O₂ → 2 H₂O');
  // The letter ended the mode by itself.
  await expect(key('Tiefstellen')).toBeVisible();
  await keyRowShots(page, '72-chem-typed');

  const sent = page.waitForRequest((r) => r.url().endsWith('/answer') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  expect((await sent).postDataJSON()).toMatchObject({ text: '2 H₂ + O₂ → 2 H₂O' });
  // Counted by code against the key "$2H_{2} + O_{2} \longrightarrow 2H_{2}O$" — no tutor.
  await expect(right(page)).toBeVisible();
  await bothSchemes(page, '73-chem-correct');

  // The equilibrium drawn in the question; a charge raised with its sign.
  await nextQuestion(page, 'Sulfat-Ion');
  await expect(page.getByLabel(/steht im Gleichgewicht mit/).first()).toBeAttached();
  await field.click();
  await field.pressSequentially('SO');
  await key('Tiefstellen').click();
  await field.pressSequentially('4');
  await key('Ladung').click();
  await field.pressSequentially('2-');
  await expect(field).toHaveValue('SO₄²⁻');
  await keyRowShots(page, '74-chem-charge');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(right(page)).toBeVisible();
});

test('formulas: math keys page by page, the new notation drawn, no keys over whole numbers (issue #239)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Ungleichungen und Summen üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Ich hab dir Aufgaben vorbereitet', { exact: false })).toBeVisible();
  await expect(page.getByText(/\\int|pmatrix/)).toHaveCount(0);
  await expect(page.getByLabel(/Integral von 0 bis 2/).first()).toBeAttached();
  await bothSchemes(page, '75-math-buddy');
  await offerStart(page, 'Ich hab dir Aufgaben vorbereitet').click();
  await expect(page.getByText('Das Quadrat von', { exact: false })).toBeVisible();

  const field = page.getByLabel('Deine Antwort');
  const key = (name: string) => page.getByRole('button', { name, exact: true });
  await field.click();
  await expect(page.getByRole('toolbar', { name: 'Mathe-Zeichen' })).toBeVisible();
  await keyRowShots(page, '76-math-keys-page1');
  await field.pressSequentially('x');
  await key('Hochzahl').click();
  await field.pressSequentially('2');
  // ≤ is not on the first page of this question: "…" turns to the next keys.
  await expect(key('kleiner gleich')).toHaveCount(0);
  await key('Weitere Zeichen').click();
  await keyRowShots(page, '77-math-keys-more');
  // How the keys fall on pages depends on the width; "…" turns until ≤ shows.
  await field.focus();
  for (let i = 0; i < 4 && (await key('kleiner gleich').count()) === 0; i++)
    await key('Weitere Zeichen').click();
  await key('kleiner gleich').click();
  await field.pressSequentially('3');
  await expect(field).toHaveValue('x² ≤ 3');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(right(page)).toBeVisible();

  // A sum and a binomial coefficient, drawn and read out.
  await nextQuestion(page, 'Wie viel ist');
  await expect(page.getByLabel(/Summe von i gleich 1 bis 4/).first()).toBeAttached();
  await expect(page.getByLabel(/4 über 2/).first()).toBeAttached();
  await bothSchemes(page, '78-math-sum-binom');
  await field.fill('16');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(right(page)).toBeVisible();

  // A table of whole numbers: the phone's digits write them, no row of math keys above.
  await nextQuestion(page, 'Einmaleins-Tabelle');
  const gap = page.getByLabel('5, 3', { exact: true });
  await expect(gap).toBeVisible();
  await gap.click();
  await expect(page.getByTestId('math-keys')).toHaveCount(0);
  await gap.fill('15');
  await page.getByLabel('5, 4', { exact: true }).fill('20');
  await page.getByLabel('6, 3', { exact: true }).fill('18');
  await page.getByLabel('6, 3', { exact: true }).focus();
  await expect(page.getByTestId('math-keys')).toHaveCount(0);
  await bothSchemes(page, '79-table-whole-no-keys');
});

test('the task typed back and a decay that does not add up, both named by code (#235, #263)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Ich will Faktorisieren üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByText('Faktorisieren und einen Zerfall vorbereitet', { exact: false }),
  ).toBeVisible();
  // A fresh learner: this is the only offer in the thread.
  await page.getByRole('button', { name: START }).last().click();
  await expect(page.getByText('Faktorisiere', { exact: false }).first()).toBeVisible();

  // The task's own term written back: the same value, nothing done — a near miss, said gently.
  const field = page.getByLabel('Deine Antwort');
  await field.fill('x^2+2x+1');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(
    page.getByText('Gleichwertig – aber das steht genau so schon in der Aufgabe.', {
      exact: false,
    }),
  ).toBeVisible();
  await bothSchemes(page, '41-typed-back');

  // The key's form with its factors written out is right.
  await expect(async () => {
    await field.fill('(x+1)(x+1)');
    await expect(field).toHaveValue('(x+1)(x+1)', { timeout: 1000 });
  }).toPass();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();

  // A decay whose mass numbers do not add up: the place, counted.
  await expect(page.getByText('Zerfallsgleichung', { exact: false }).first()).toBeVisible();
  await field.fill('U-238 → Th-234 + He-3');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(
    page.getByText('Fast – die Massenzahlen stimmen noch nicht: links 238, rechts 237.'),
  ).toBeVisible();
  await bothSchemes(page, '42-decay-unbalanced');
});
