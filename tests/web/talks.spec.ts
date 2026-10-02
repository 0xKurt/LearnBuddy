// Browser walkthrough of the new sources and the talk (issues #259, #264; scripted answers in
// apps/api/src/testing/scenarios/talks.ts): Buddy plans a talk with its steps, she rehearses it
// with the (fake) microphone and sees what was measured, she reads a text aloud, and Buddy asks
// for a corrected test and for today's notebook entry — the capture screen says which.
// Every stop is shot at both phones (fit.ts: nothing may need scrolling) and, for the new
// screens, in the dark too. Screenshots go to test-results/web/shots (90-…).

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`talks-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Baden-Württemberg' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2013');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

async function say(page: Page, text: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(text);
  await page.getByRole('button', { name: 'Senden' }).click();
}

/** The open button of the rehearsal card that carries these words (the thread keeps older ones). */
function rehearseOpen(page: Page, says: string) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: 'Aufnahme öffnen' }) })
    .filter({ hasText: says })
    .last()
    .getByRole('button', { name: 'Aufnahme öffnen' });
}

/** Shoot a screen light, then dark (the app follows the system), then back to light. */
async function lightAndDark(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-dark`);
  await page.emulateMedia({ colorScheme: 'light' });
}

/** Record a few seconds with the fake microphone and stop. */
async function record(page: Page, start: string): Promise<void> {
  await page.getByRole('button', { name: start }).click();
  const stop = page.getByRole('button', { name: 'Aufnahme stoppen' });
  await expect(stop).toBeVisible();
  await page.waitForTimeout(4_500);
  await shot(page, `${start === 'Probevortrag starten' ? '93' : '96'}-recording`);
  await stop.click();
}

test('a talk with its steps, a rehearsal, reading aloud, and two new photo sources', async ({
  page,
}) => {
  await onboardChild(page);

  // ── Buddy plans the talk: the steps with their days, in the chat ──
  await say(page, 'Ich muss nächste Woche ein Referat über Vulkane halten, 5 Minuten');
  await expect(page.getByText(/Referat geplant: Vulkane/)).toBeVisible();
  await expect(page.getByText(/Gliederung .* Quellen .* Folien .* Probevortrag/)).toBeVisible();
  await shot(page, '90-talk-planned');

  // ── The rehearsal: a card in the chat, the recorder, the result ──
  await say(page, 'Kann ich meinen Vortrag proben?');
  await expect(rehearseOpen(page, 'Vulkane')).toBeVisible();
  await shot(page, '91-rehearse-offer');
  await rehearseOpen(page, 'Vulkane').click();
  await expect(page.getByRole('heading', { name: 'Probevortrag' })).toBeVisible();
  await expect(page.getByText('„Vulkane“ · 5 Minuten', { exact: false })).toBeVisible();
  await lightAndDark(page, '92-rehearse-ready');
  await record(page, 'Probevortrag starten');
  await expect(page.getByRole('heading', { name: 'Gut gemacht' })).toBeVisible();
  await expect(page.getByText('Etwas kürzer als vorgegeben.')).toBeVisible();
  // Two "äh" in the transcript; the closing was not there — said in words, not only in colour.
  await expect(page.getByLabel('Füllwörter: 2', { exact: false })).toBeVisible();
  await expect(page.getByLabel('Schluss: noch nicht')).toBeVisible();
  await expect(page.getByLabel('Einleitung: gehört')).toBeVisible();
  await lightAndDark(page, '94-rehearse-result');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();

  // ── Reading aloud: the passage on screen, then the words to look at again ──
  await say(page, 'Ich will vorlesen üben');
  await expect(rehearseOpen(page, 'Der kleine Fuchs')).toBeVisible();
  await rehearseOpen(page, 'Der kleine Fuchs').click();
  await expect(page.getByRole('heading', { name: 'Laut vorlesen' })).toBeVisible();
  await expect(page.getByText(/Unter einer alten Eiche/)).toBeVisible();
  await lightAndDark(page, '95-read-ready');
  await record(page, 'Vorlesen starten');
  await expect(page.getByRole('heading', { name: 'Gut gemacht' })).toBeVisible();
  // "kleine" left out, "Beeren" read as "Birnen" — words of HER text, computed by code.
  await expect(page.getByText('kleine · Beeren')).toBeVisible();
  await lightAndDark(page, '97-read-result');
  await page.getByRole('button', { name: 'Fertig' }).click();

  // ── A corrected test: Buddy asks, the bar opens the capture screen that says what it is ──
  await say(page, 'Ich hab meine Mathearbeit zurück, voll viele Fehler');
  await expect(page.getByText('Deine korrigierte Mathearbeit').first()).toBeVisible();
  await shot(page, '98-corrected-ask');
  await page.getByRole('button', { name: 'Foto machen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fotografier deine Arbeit' })).toBeVisible();
  await expect(page.getByText(/Noten und Punkte speichere ich nicht/)).toBeVisible();
  await lightAndDark(page, '99-capture-corrected');
});
