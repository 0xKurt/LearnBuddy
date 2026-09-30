// Answers given offline (runs after modes.spec.ts: the scripted model answers
// in order). Each is kept on the device (lib/api/outbox.ts):
// - back online with the app open, it goes out exactly once — the waiting
//   send and the outbox never both send it;
// - after the app was closed, it is sent on the next start.

import { expect, test } from '@playwright/test';

test('answers given offline arrive once: app open, and after it was closed', async ({
  browser,
}) => {
  const context = await browser.newContext();
  let page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`offline-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Ich selbst' }).click();
  await page.getByLabel('Wie soll Buddy dich nennen?').fill('Sam');
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2000');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  // The three first-start cards (app/onboarding.tsx) come before the home.
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();

  // Started the way the app starts things now: asked in the chat, Buddy offers it.
  await page.getByLabel('Schreib Buddy …').fill('Ich will Hauptstädte üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Wie heißt die Hauptstadt von Frankreich?')).toBeVisible();
  const practiceUrl = page.url();

  // Offline with the app open: the answer waits and goes out once when back online.
  await context.setOffline(true);
  await page.getByLabel('Deine Antwort').fill('Paris');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Keine Verbindung', { exact: false })).toBeVisible();
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/answer$/.test(r.url())) sent.push(r.postData() ?? '');
  });
  await context.setOffline(false);
  await expect(page.getByText('Stimmt – gut gemacht!')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500); // a second send would have started by now
  expect(sent).toHaveLength(1);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Wie heißt die Hauptstadt von Italien?')).toBeVisible();

  // Offline again: she answers; it waits. Then the app is closed.
  await context.setOffline(true);
  await page.getByLabel('Deine Antwort').fill('Rom');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Keine Verbindung', { exact: false })).toBeVisible();
  await page.waitForTimeout(300);
  await page.close();

  // Back online, the app opened again: the kept answer is sent by itself.
  await context.setOffline(false);
  page = await context.newPage();
  await page.goto(practiceUrl);
  await expect(page.getByText(/Du hast \d+ Fragen? beantwortet/)).toBeVisible({ timeout: 30_000 });
  await context.close();
});
