// Real shared photo decisions on the published app/API; no injected page state.
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { freshEmail, planTest, signUpMia, worksheetJpeg } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

for (const look of SCREEN_LOOKS) {
  test(`photo review · ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await signUpMia(page, freshEmail('photo-review'));
    await screenLook(page, look);
    await planTest(page);
    const blurry = join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures/blur.jpg');
    const title = page.getByText('Foto 1 ist unscharf.', { exact: true });
    const choose = async () => {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Foto machen', exact: true }).click();
      await (await chooser).setFiles(blurry);
      await expect(title).toBeVisible();
    };
    await choose();
    await page
      .getByRole('button', { name: 'Trotzdem behalten', exact: true })
      .scrollIntoViewIfNeeded();
    const key = `${look.family}-${look.dark ? 'dark' : 'light'}`;
    await screenShots(page, `photo-review-${key}-decisions`);
    await page.getByRole('button', { name: 'Trotzdem behalten', exact: true }).click();
    await expect(title).toHaveCount(0);
    // A kept page says so in words on its preview, never by colour alone.
    const flag = page.getByTestId('attach-tile').getByText('Schwer lesbar', { exact: true });
    await expect(page.getByRole('img', { name: 'Foto 1 von 1', exact: true })).toBeVisible();
    await expect(flag).toBeVisible();
    await page.getByRole('button', { name: 'Foto 1 entfernen', exact: true }).click();
    // Photos go through the chat bar (#599 R5): she never leaves the conversation.
    await expect(page).toHaveURL(/\/buddy$/);
    await choose();
    const photo = await worksheetJpeg(page);
    const retake = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Neu fotografieren', exact: true }).click();
    await (await retake).setFiles(photo);
    await expect(title).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Foto 1 von 1', exact: true })).toBeVisible();
    await expect(flag).toHaveCount(0);
    await screenShots(page, `photo-review-${key}-retaken`);
  });
}
