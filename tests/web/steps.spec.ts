// Browser walkthrough of a guided worked example (issue #298: Vormachen → Mitmachen →
// Selbermachen), against the real API with the scripted model
// (apps/api/src/testing/scenarios/steps.ts):
//   - „Tipp" shows the next step of a way code proved, with what was done (Vormachen);
//   - she writes the next line herself; code says "Der Schritt stimmt – und weiter?" (Mitmachen);
//   - the way's last line is right, and the next task is hers alone (Selbermachen).
// Every state is shot at 390×844 and 360×740, light and dark (CLAUDE.md rule 17).

import { expect, test, type Page } from '@playwright/test';

import { onboardChild, startOffer } from './figureWalk';
import { PHONES, shot } from './fit';

const TASK = 'Löse die Gleichung 2(x + 3) = 14.';

/** Writes a line into the answer field until it holds (a theme switch may remount it). */
async function write(page: Page, text: string): Promise<void> {
  const field = page.getByLabel('Deine Antwort');
  await expect(async () => {
    await field.fill(text);
    await expect(field).toHaveValue(text, { timeout: 1000 });
  }).toPass();
  await page.getByRole('button', { name: 'Prüfen' }).click();
}

/** The run, walked once per colour scheme: each state is shot in the scheme it was reached in. */
async function walk(page: Page, scheme: 'light' | 'dark'): Promise<void> {
  const night = scheme === 'dark' ? '-night' : '';
  // A new run each time (the first one is only paused by „Übung beenden").
  if (scheme === 'light')
    await startOffer(page, 'Lass uns Klammergleichungen üben', 'ich rechne dir vor');
  else
    await startOffer(page, 'Lass uns Klammergleichungen wiederholen', 'ich rechne dir wieder vor');
  await expect(page.getByText(TASK)).toBeVisible();
  // The scheme switches once the run is open: a switch remounts the chat's field mid-fill.
  await page.emulateMedia({ colorScheme: scheme });
  // The ladder is written in the background right after the start.
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Einen Tipp bekommen' }).click();
  await expect(page.getByText('Klammer auflösen', { exact: false })).toBeVisible();
  await shot(page, `298a-step-shown${night}`);
  await write(page, '2x = 8');
  await expect(page.getByText('Der Schritt stimmt – und weiter?')).toBeVisible();
  await shot(page, `298b-step-ok${night}`);
  await write(page, 'x = 4');
  await expect(page.getByText('Richtig', { exact: true }).last()).toBeVisible();
  await shot(page, `298c-solved${night}`);
  await page.getByRole('button', { name: 'Übung beenden' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

test('a guided worked example: a step shown, hers checked, the way solved (issue #298)', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await onboardChild(page, 'steps');
  await page.setViewportSize(PHONES[0]);
  await walk(page, 'light');
  await walk(page, 'dark');
});
