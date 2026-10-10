// Browser walkthrough of a roleplay in a foreign language (issue #244), against the real API
// with the scripted model (apps/api/src/testing/scenarios/roleplay.ts): asked for in the chat,
// the role card, a line in English, a line in German (the app's own hint), a line by voice in
// the conversation mode, her tap on "end" and the feedback per key point — no new screen.
// Shots at both phone sizes, light and dark (tests/web/fit.ts).

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`roleplay-${Date.now()}@example.test`);
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
  await page.getByRole('button', { name: 'Weiter' }).click();
  // Notifications are asked of the adults right after their PIN (issue #518).
  await page.getByRole('button', { name: 'Nein, danke' }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(text);
  await page.getByRole('button', { name: 'Senden' }).click();
}

async function setDark(page: Page, dark: boolean): Promise<void> {
  await page.getByRole('button', { name: 'Mehr' }).click();
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Aussehen' }).click();
  const sw = page.getByRole('switch', { name: 'Hell oder dunkel?' });
  if ((await sw.getAttribute('aria-checked')) !== String(dark)) await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', String(dark));
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

test('roleplay: in the chat, in the role, by voice, and feedback per key point', async ({
  page,
}) => {
  await onboardChild(page);

  // ── Asked for in the chat: the role card stands under Buddy's first line ──
  await send(page, 'Lass uns ein Rollenspiel auf Englisch machen, ich bin im Café');
  await expect(page.getByText('ROLLENSPIEL · ENGLISCH', { exact: true })).toBeVisible();
  await expect(page.getByText('Buddy spielt: Kellner')).toBeVisible();
  await expect(page.getByText('Nach dem Preis fragen')).toBeVisible();
  // The way out is pinned above the conversation, where it stays when the card has scrolled
  // away with the scene — one button, not one on the card as well.
  const end = page.getByRole('button', { name: "Beenden – wie lief's?" });
  await expect(end).toHaveCount(1);
  await expect(page.getByTestId('roleplay-strip')).toBeVisible();
  await shot(page, '40-roleplay-card');
  // What runs stays whole on its one line at 360 too, beside the round ✕ (issue #334.3).
  await page.setViewportSize({ width: 360, height: 740 });
  const what = page.getByTestId('roleplay-strip').getByText('Rollenspiel · Im Café in London');
  await expect(what).toBeVisible();
  expect(await what.evaluate((el) => el.scrollWidth <= el.clientWidth), 'not cut').toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });

  // ── A line in English: Buddy answers in the role ──
  await send(page, 'Hello! A hot chocolate, please.');
  await expect(page.getByText('Would you like a piece of cake with it?')).toBeVisible();
  await shot(page, '41-roleplay-line');

  // ── A line in German: the app's own hint, the model's words are not shown ──
  await send(page, 'Was kostet das?');
  await expect(page.getByText(/Versuch's auf Englisch/)).toBeVisible();
  await expect(page.getByText('It is three pounds fifty.')).toHaveCount(0);
  await setDark(page, true);
  await shot(page, '42-roleplay-hint-dark');

  // ── By voice in the conversation mode: it listens in English while the scene runs ──
  await page.getByRole('button', { name: 'Mit Buddy sprechen' }).click();
  await expect(page.getByText('GESPRÄCH')).toBeVisible();
  await expect(page.getByText('Ich höre zu.')).toBeVisible();
  const transcribed = page.waitForRequest((r) => r.url().endsWith('/v1/voice/transcribe'));
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Aufnahme stoppen' }).click();
  const req = await transcribed;
  expect(req.postData() ?? '').toContain('"lang":"en"');
  await expect(page.getByText('How much it costs?').last()).toBeVisible();
  await expect(
    page.getByText('That is three pounds fifty, please. Anything else?').last(),
  ).toBeVisible();
  await shot(page, '43-roleplay-talk-dark');
  await page.getByRole('button', { name: 'Beenden', exact: true }).last().click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();

  // ── Her tap on "end": feedback per key point, with her own words, no grade ──
  await expect(page.getByTestId('roleplay-strip')).toBeVisible();
  await shot(page, '43b-roleplay-strip-dark');
  // The card has scrolled away by now; the strip carries the way out.
  await page.getByTestId('roleplay-strip').getByRole('button').click();
  // The Probetest's "So lief's" list (issue #384), from the structured feedback — not the text.
  await expect(page.getByRole('heading', { name: "So lief's" })).toBeVisible();
  await expect(page.getByText('„Hello“', { exact: true })).toBeVisible();
  await expect(page.getByText('Nach dem Preis fragen', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Noch nicht dabei', { exact: true })).toBeVisible();
  await expect(page.getByText('„How much it costs?“', { exact: true })).toBeVisible();
  await expect(page.getByText('„How much does it cost?“', { exact: true })).toBeVisible();
  // The invented quote is not shown, and the text is not shown beside the card.
  await expect(page.getByText(/What is the price/)).toHaveCount(0);
  await expect(page.getByText(/so lief es:/)).toHaveCount(0);
  // Over: the strip with the way out is gone (the card above has scrolled away with the scene).
  await expect(page.getByTestId('roleplay-strip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Beenden – wie lief's?" })).toHaveCount(0);
  await shot(page, '44-roleplay-feedback-dark');
  await setDark(page, false);
  await shot(page, '45-roleplay-feedback');
});
