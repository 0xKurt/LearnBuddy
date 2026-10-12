import { expect, test } from '@playwright/test';
import { shot } from './fit';
import { freshEmail, signUpMia } from './coreLoop';
import { SETTINGS_LOOKS, settingsLook, settingsShots } from './redesign-settings-matrix';

test('settings: grouped real choices, notification state and parent boundary', async ({ page }) => {
  test.setTimeout(240_000);
  await signUpMia(page, freshEmail('settings-redesign'));
  for (const look of SETTINGS_LOOKS) {
    const key = await settingsLook(page, look);
    await page.goto('/settings');
    await expect(page.getByText(/^Ja – nie nach/)).toBeVisible();
    await expect(page.getByText('Daten exportieren')).toHaveCount(0);
    await settingsShots(page, `settings-${key}`);
    await page.getByRole('button', { name: 'Benachrichtigungen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Nicht mehr erlauben' })).toBeVisible();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await settingsShots(page, `settings-${key}-contact`);
  }
});

test('settings password sheet: shared labels, mismatch and keyboard fit without credential update', async ({
  page,
}) => {
  await signUpMia(page, freshEmail('settings-password-layout'));
  const key = await settingsLook(page, SETTINGS_LOOKS[0]);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Öffnen', exact: true }).click();
  for (const digit of '4826') await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Passwort ändern', exact: true }).click();
  for (const digit of '4826') await page.getByRole('button', { name: digit, exact: true }).click();
  const first = page.getByLabel('Neues Passwort', { exact: true });
  const repeat = page.getByLabel('Neues Passwort wiederholen', { exact: true });
  await expect(first).toBeVisible();
  await expect(page.getByText('Mindestens 8 Zeichen.', { exact: true })).toBeVisible();
  await expect(repeat).toBeVisible();
  await first.fill('anderes-passwort-123');
  await repeat.fill('anders');
  await expect(repeat).toBeFocused();
  await expect(
    page.getByText('Die beiden Passwörter sind noch nicht gleich.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Passwort speichern', exact: true }),
  ).toBeDisabled();
  await settingsShots(page, `settings-password-${key}`, true);
  await page.setViewportSize({ width: 360, height: 420 });
  await repeat.click();
  await expect(repeat).toBeInViewport();
  await shot(page, 'settings-password-keyboard', {
    phones: [{ width: 360, height: 420 }],
    opened: true,
  });
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  // Existing provider cannot perform password update here; layout proof never submits.
});

test('settings inline PIN fields use their actual viewport clearance above the keyboard', async ({
  page,
}) => {
  await signUpMia(page, freshEmail('settings-inline-pin'));
  await settingsLook(page, SETTINGS_LOOKS[0]);
  await page.getByRole('button', { name: 'Öffnen', exact: true }).click();
  for (const digit of '4826') await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'PIN ändern', exact: true }).click();
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 420 });
  const current = page.getByLabel('Aktuelle PIN', { exact: true });
  const next = page.getByLabel('Neue PIN (4 Ziffern)', { exact: true });
  const repeat = page.getByLabel('Neue PIN wiederholen', { exact: true });
  const list = page.getByTestId('scroll-list');
  for (const field of [current, next, repeat]) {
    await field.focus();
    await expect(field).toBeFocused();
    await expect
      .poll(async () => {
        const bounds = await field.boundingBox();
        const clip = await list.boundingBox();
        return (
          bounds !== null &&
          clip !== null &&
          bounds.y >= clip.y &&
          bounds.y + bounds.height <= clip.y + clip.height
        );
      })
      .toBe(true);
  }
  await next.fill('5837');
  await expect(repeat).toBeFocused();
  await expect(next).toHaveValue('5837');
  await repeat.fill('5838');
  await expect(page.getByRole('button', { name: 'PIN speichern', exact: true })).toBeDisabled();
  await shot(page, 'settings-inline-pin-keyboard', { phones: [{ width: 360, height: 420 }] });
  // No credentials/PIN are changed by this layout proof.
});
