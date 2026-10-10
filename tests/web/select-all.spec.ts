// Browser walkthrough of several right answers (issue #240), against the real API with the
// scripted model (apps/api/src/testing/scenarios/selectAll.ts): "Kreuze alle richtigen an". The
// options are the tiles of a single choice, each a checkbox; one quiet line says that several
// are right — never how many — and "Prüfen" sends the set, judged by code. Both cases are the
// LARGEST a select-all may be (contracts/structured.ts): six short cases two by two, and four
// statements one under the other below a two-line question. Every `shot` measures at 390×844
// and 360×740 that nothing has to be scrolled (tests/web/fit.ts), also with Buddy's reply above.

import { expect, test, type Page } from '@playwright/test';

import { bothSchemes, PHONES } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`select-${Date.now()}@example.test`);
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

test('mehrere richtige ankreuzen: checkboxes, a gentle count, the set judged by code (issue #240)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.setViewportSize(PHONES[0]);
  const box = (name: string) => page.getByRole('checkbox', { name, exact: true });
  const check = page.getByRole('button', { name: 'Prüfen' });

  // ── six short cases, two by two ──
  await page.getByLabel('Schreib Buddy …').fill('Lass uns Fälle in Latein bestimmen');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('kreuz an, was alles passt', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Welche Fälle kann „rosae“ sein?')).toBeVisible();
  await expect(page.getByText('Mehrere sind richtig – tippe alle an.')).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(6);
  await expect(check).toBeDisabled();
  await bothSchemes(page, '45a-select-grid-start');
  for (const form of ['Genitiv', 'Dativ', 'Akkusativ']) await box(form).click();
  await expect(box('Genitiv')).toHaveAttribute('aria-checked', 'true');
  // One more tap takes a tick back again.
  await box('Akkusativ').click();
  await expect(box('Akkusativ')).toHaveAttribute('aria-checked', 'false');
  await box('Akkusativ').click();
  await bothSchemes(page, '45b-select-grid-ticked');
  // The theme switch rebuilt the tree; her ticks are still there (the draft).
  await expect(box('Akkusativ')).toHaveAttribute('aria-checked', 'true');
  const sent = page.waitForRequest((r) => r.url().endsWith('/answer') && r.method() === 'POST');
  await check.click();
  const body = (await sent).postDataJSON() as { parts: { type: string; chosen: string[] } };
  expect(body.parts.type).toBe('select_all');
  expect(body.parts.chosen).toHaveLength(3);
  const partial = '2 von 4 richtigen hast du schon. Eine passt aber nicht dazu.';
  await expect(page.getByText(partial)).toBeVisible();
  await expect(page.getByText(partial)).toBeInViewport();
  await bothSchemes(page, '45c-select-grid-feedback');
  // Her ticks stay; she fixes them.
  await box('Akkusativ').click();
  await box('Nominativ').click();
  await box('Vokativ').click();
  await check.click();
  await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── four statements, one under the other ──
  await page.getByLabel('Schreib Buddy …').fill('Ich will für die Fahrradprüfung üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('wie in der Fahrradprüfung', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(
    page.getByText('Was muss ein Fahrrad für die Straße', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(4);
  await bothSchemes(page, '45d-select-list-start');
  for (const thing of ['Zwei unabhängige Bremsen', 'Ein Gepäckträger mit Gurt']) {
    await box(thing).click();
  }
  await check.click();
  const listPartial = '1 von 3 richtigen hast du schon. Eine passt aber nicht dazu.';
  await expect(page.getByText(listPartial)).toBeInViewport();
  await bothSchemes(page, '45e-select-list-feedback');
  // The second miss names the one that does not belong — help, counted as a hint.
  await check.click();
  await expect(
    page.getByText('Schau dir „Ein Gepäckträger mit Gurt“ nochmal an.', { exact: false }),
  ).toBeVisible();
  await box('Ein Gepäckträger mit Gurt').click();
  await box('Ein weißer Scheinwerfer vorn').click();
  await box('Rückstrahler an den Pedalen').click();
  await check.click();
  await expect(page.getByText('Stimmt', { exact: false }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
});
