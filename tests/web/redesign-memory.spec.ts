import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia, askShorter, openMenu } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

for (const look of SCREEN_LOOKS) {
  test(`redesign Memory ${look.family} ${look.dark ? 'dark' : 'light'}: edit persistence, remove and undo`, async ({
    page,
  }) => {
    test.setTimeout(360_000);
    await signUpMia(page, freshEmail('redesign-memory'));
    const appearance = await screenLook(page, look);
    await openMenu(page, 'Was Buddy über dich weiß');
    await expect(page.getByText('Noch nichts gemerkt', { exact: true })).toBeVisible();
    await screenShots(page, `redesign-memory-${appearance}-empty`);
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await askShorter(page);
    await openMenu(page, 'Was Buddy über dich weiß');
    await screenShots(page, `redesign-memory-${appearance}-notes`);
    await page.getByRole('button', { name: /^Möchte kurze Übungen/ }).click();
    let sheet = page.locator('[aria-modal="true"]');
    await screenShots(page, `redesign-memory-${appearance}-actions`, true);
    await sheet.getByRole('button', { name: 'Ändern: Möchte kurze Übungen', exact: true }).click();
    const input = page.getByLabel('Was Buddy sich merken soll');
    await expect(input).toBeVisible();
    await input.fill('Möchte kurze Übungen mit Pausen');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByText('Geändert.', { exact: true })).toBeVisible();
    await page.reload();
    const row = page.getByRole('button', { name: /^Möchte kurze Übungen mit Pausen/ });
    await expect(row).toBeVisible();
    await row.click();
    sheet = page.locator('[aria-modal="true"]');
    await sheet
      .getByRole('button', { name: 'Entfernen: Möchte kurze Übungen mit Pausen', exact: true })
      .click();
    await expect(page.getByText('Das entfernen?', { exact: true })).toBeVisible();
    await screenShots(page, `redesign-memory-${appearance}-remove-confirm`, true);
    await page.getByRole('button', { name: 'Ja, entfernen', exact: true }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(row).toBeVisible();
    await page.reload();
    await expect(row).toBeVisible();
  });
}
