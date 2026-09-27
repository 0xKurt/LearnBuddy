// Always a way out of onboarding (H-22): whoever does not agree to the privacy
// text, or signed in with the wrong account, can leave from the consent and the
// profile screen — and comes back to the same step when signing in again.

import { expect, test } from '@playwright/test';

test('sign up, decline at consent, sign in again, leave at the profile step', async ({ page }) => {
  const email = `exit-${Date.now()}@example.test`;
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();

  // Not agreeing is a real choice: it signs out.
  await expect(page.getByText('Kurz zum Datenschutz')).toBeVisible();
  await page.getByRole('button', { name: 'Nicht einverstanden – abmelden' }).click();
  await expect(page.getByText('Dein Lernbuddy für Arbeiten und Tests.')).toBeVisible();

  // Back again: still at consent; now agree, and leave at the profile step instead.
  await page.getByRole('radio', { name: 'Anmelden' }).click();
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).last().click();
  await expect(page.getByText('Kurz zum Datenschutz')).toBeVisible();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Wer lernt mit LearnBuddy?')).toBeVisible();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByText('Dein Lernbuddy für Arbeiten und Tests.')).toBeVisible();
});
