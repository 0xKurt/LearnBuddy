// Prepared against real dev-stack scenarios; execute only after ordered integration.
import { expect, test } from '@playwright/test';
import { freshEmail, planTest, signUpMia, worksheetJpeg, openMenu } from './coreLoop';
import { join } from 'node:path';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import { PALETTES } from '../../apps/mobile/lib/theme/palettes';

for (const look of SCREEN_LOOKS) {
  const { family, dark } = look;
  test(`capture · ${family} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await signUpMia(page, freshEmail('capture'));
    await screenLook(page, look);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const key = dark ? `${family}Dark` : family;
    await planTest(page);
    const photo = await worksheetJpeg(page);
    let chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Foto machen', exact: true }).click();
    await (
      await chooser
    ).setFiles(join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures/blur.jpg'));
    await expect(page.getByText('Foto 1 ist unscharf.', { exact: true })).toBeVisible();
    await screenShots(page, `capture-${key}-quality`);
    chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Neu fotografieren', exact: true }).click();
    await (await chooser).setFiles(photo);
    await expect(page.getByText('Foto 1 ist unscharf.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Foto 1 von 1', exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await screenShots(page, `capture-${key}-preview`);
    await page.getByRole('button', { name: 'Foto 1 von 1', exact: true }).click();
    await expect(
      page.locator('[aria-modal="true"]').getByRole('button', { name: 'Schließen', exact: true }),
    ).toBeVisible();
    await screenShots(page, `capture-${key}-zoom`, true);
    await page
      .locator('[aria-modal="true"]')
      .getByRole('button', { name: 'Schließen', exact: true })
      .click();
    await page.getByRole('button', { name: 'Foto 1 entfernen', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Foto 1 von 1', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Was möchtest du anhängen?', exact: true }).click();
    await screenShots(page, `capture-${key}-sources`, true);
    chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Aus (der )?Galerie/ }).click();
    await (await chooser).setFiles(photo);
    const check = page.getByRole('button', { name: 'Senden', exact: true });
    const colour = parseInt(PALETTES[key as keyof typeof PALETTES].primary.slice(1), 16);
    await expect
      .poll(() =>
        check.evaluate((button) => getComputedStyle(button.firstElementChild!).backgroundColor),
      )
      .toBe(`rgb(${colour >> 16}, ${(colour >> 8) & 255}, ${colour & 255})`);
    await check.click();
    await expect(
      page.getByRole('button', { name: /^Übung bereit: Mathearbeit Brüche\./ }),
    ).toBeVisible({ timeout: 30_000 });
    await openMenu(page, 'Dein Material');
    await page.getByRole('button', { name: /^Mathe: / }).click();
    await page
      .getByRole('button', {
        name: 'Brüche kürzen und vergleichen',
        exact: true,
      })
      .click();
    await page
      .locator('[aria-modal="true"]:visible')
      .getByRole('button', { name: 'Fragen ansehen', exact: true })
      .click();
    await expect(page.locator('[aria-modal="true"]:visible')).toHaveCount(0);
    await expect(page.getByText(/^Welcher Bruch ist größer:/).first()).toBeVisible();
    await screenShots(page, `capture-${key}-questions`);
  });
}
