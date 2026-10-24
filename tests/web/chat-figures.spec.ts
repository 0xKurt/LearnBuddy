import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

for (const look of SCREEN_LOOKS.filter((l) => l.family === 'pastell')) {
  test(`chat pictures ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    await signUpMia(page, freshEmail('chat-pictures'));
    const key = await screenLook(page, look);
    for (const [message, name] of [
      ['Zeig mir das Skelett mit Bild', 'skeleton'],
      ['Zeig mir drei Viertel mit Kreisbild', 'fraction'],
    ]) {
      await page.getByLabel('Schreib Buddy …').fill(message!);
      await page.getByRole('button', { name: 'Senden', exact: true }).click();
      const card = page.getByTestId('chat-figure').last();
      await expect(card).toBeVisible();
      await expect(card.getByTestId('figure-sizing')).toHaveCount(0);
      if (name === 'skeleton') await expect(card.getByText('1. Schädel')).toBeVisible();
      await screenShots(page, `chat-picture-${name}-${key}`);
    }
  });
}
