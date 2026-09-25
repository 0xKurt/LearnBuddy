// Browser walkthrough of the learning modes (after core-loop.spec.ts, same dev
// stack; scripted answers in apps/api/src/testing/scenarios/learning-modes.ts):
// "Erklär mir …", homework help with hints only, practice without a photo with
// math and a figure, a practice test (no hints, results at the end) and
// "die wackligen nochmal". Screenshots go to test-results/web/shots.

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const SHOTS = join(__dirname, '../../test-results/web/shots');

async function shot(page: Page, name: string, height = 1500): Promise<void> {
  const size = page.viewportSize();
  await page.setViewportSize({ width: size?.width ?? 390, height });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  if (size) await page.setViewportSize(size);
}

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`modes-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByLabel('TT').fill('10');
  await page.getByLabel('MM').fill('02');
  await page.getByLabel('JJJJ').fill('2014');
  await page.getByRole('checkbox').click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Hallo Lena')).toBeVisible();
}

test('learning modes: explain, homework help without the solution, practice with math', async ({
  page,
}) => {
  await onboardChild(page);
  // No tiles or lists: Buddy, and suggestions to tap above the field.
  await expect(page.getByRole('button', { name: 'Erklär mir was' })).toBeVisible();
  await expect(page.getByText('Was willst du machen?')).toHaveCount(0);
  await shot(page, '20-home-start-row');

  // ── "Erklär mir was" → explanation, then questions ──
  await page.getByRole('button', { name: 'Erklär mir was' }).click();
  await expect(page.getByText('Was soll ich dir erklären?')).toBeVisible();
  await page.getByRole('textbox').last().fill('den Dativ, ich check das nicht');
  await shot(page, '21-explain-sheet');
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(
    page.getByText('Du findest ihn mit der Frage „Wem?“', { exact: false }),
  ).toBeVisible();
  await shot(page, '22-explain-intro');
  await page.getByRole('button', { name: 'Verstanden – frag mich!' }).click();
  await page.getByRole('button', { name: 'Wem?', exact: true }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  // A fill-in sentence: the gap is drawn, and her answer appears in it while she types.
  await expect(page.getByLabel(/Ich helfe Lücke Mutter/)).toBeVisible();
  await page.getByLabel('Deine Antwort').fill('der');
  await expect(page.getByLabel(/Lücke, darin: der/)).toBeVisible();
  await shot(page, '22b-fill-blank');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Auf Anhieb richtig')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Homework help: hints only, no "show solution", solved by herself ──
  await page.getByRole('button', { name: 'Hausaufgabe', exact: true }).click();
  await page.getByRole('button', { name: 'Aufgabe eintippen' }).click();
  await expect(page.getByText('Welche Aufgabe? Schreib sie ab.')).toBeVisible();
  await page
    .getByRole('textbox')
    .last()
    .fill('Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt.');
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(
    page.getByText('Hausaufgabe – ich gebe dir Tipps, die Lösung findest du selbst.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lösung zeigen' })).toHaveCount(0);
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
  await expect(page.getByRole('button', { name: 'Frage passt nicht' })).toHaveCount(0);
  await page.getByLabel('Deine Antwort').fill('28');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Selbst gelöst!', { exact: true })).toBeVisible();
  await expect(page.getByText('Stark – das hast du selbst gelöst!')).toBeVisible();
  await shot(page, '24-homework-solved');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Hausaufgabe geschafft')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Practice without a photo: fractions drawn, math rendered ──
  // Said to Buddy instead of picking a tile: Buddy answers with a start button.
  await page.getByLabel('Schreib Buddy …').fill('Ich will Brüche vergleichen üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByText('ein paar Fragen zu Brüchen vorbereitet', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Frage von Buddy')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Frage passt nicht' })).toBeVisible();
  await shot(page, '25-practice-fractions');

  // ── Voice mode: switched on in the practice header, still on at Buddy ──
  // (Recording can't run in headless Chromium; this checks the controls and the layout.)
  const voiceSwitch = page.getByRole('switch', { name: 'Sprachmodus' });
  await expect(voiceSwitch).toHaveAttribute('aria-checked', 'false');
  // Multiple choice: the mic only joins the options in voice mode.
  await expect(page.getByRole('button', { name: 'Antwort sagen' })).toHaveCount(0);
  await voiceSwitch.click();
  await expect(voiceSwitch).toHaveAttribute('aria-checked', 'true');
  const explained = page.getByText('Ich lese dir vor – antworte mit dem Mikro.');
  await expect(explained).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nochmal vorlesen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Antwort sagen' })).toHaveCount(1);
  await expect(explained).toBeHidden({ timeout: 8000 });
  await shot(page, '27-practice-voice-mode', 844);
  await page.getByRole('button', { name: 'Übung beenden' }).click();
  await expect(page.getByText('Hallo Lena')).toBeVisible();
  // Still in voice mode at Buddy: the bar is voice-first (keyboard · big mic · photo).
  await expect(page.getByRole('button', { name: 'Tastatur' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nachricht sprechen' })).toBeVisible();
  await shot(page, '26-buddy-voice-mode', 844);
  // "Tastatur" goes back to typing.
  await page.getByRole('button', { name: 'Tastatur' }).click();
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
  await shot(page, '31-open-area', 844);
  await page.getByRole('button', { name: 'Mein Stoff öffnen' }).click();
  await expect(page.getByRole('heading', { name: 'Mein Stoff' })).toBeVisible();
  await page.getByRole('button', { name: 'Zurück' }).click();

  // ── Conversation mode: she speaks, Buddy answers aloud, in the same conversation ──
  // (A fake microphone; in the browser there is no pause detection, so she taps when done.)
  await page.getByRole('button', { name: 'Mit Buddy sprechen' }).click();
  await expect(page.getByText('GESPRÄCH')).toBeVisible();
  await expect(page.getByText('Ich höre zu.')).toBeVisible();
  await expect(page.getByText('Tipp aufs Mikro, wenn du fertig bist.')).toBeVisible();
  await shot(page, '32-talk-listening', 844);
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Aufnahme stoppen' }).click();
  await expect(page.getByText('„Was steht diese Woche an?“')).toBeVisible();
  // The answer on the conversation screen (the chat underneath has it too).
  await expect(
    page.getByText('Diese Woche steht noch nichts an – magst du etwas üben?').last(),
  ).toBeVisible();
  await shot(page, '33-talk-answer', 844);
  await page.getByRole('button', { name: 'Beenden' }).last().click();
  await expect(page.getByText('Hallo Lena')).toBeVisible();
  // The same conversation: what was said by voice is in the chat.
  await expect(page.getByText('Was steht diese Woche an?')).toBeVisible();
});
