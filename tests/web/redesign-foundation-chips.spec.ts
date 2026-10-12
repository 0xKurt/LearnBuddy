import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia } from './coreLoop';
import { startOffer } from './figureWalk';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';

for (const look of SCREEN_LOOKS) {
  test(`Foundation chips: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    await signUpMia(page, freshEmail('foundation-chips'));
    const key = await screenLook(page, look);
    await page.getByLabel('Schreib Buddy …').fill('Ich spiele Handball');
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(page.getByText('Cool – Handball merke ich mir.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zurücknehmen', exact: true })).toBeVisible();
    // The current receipt adapter is real but does not consume Chip's receipt variant.
    await screenShots(page, `foundation-${key}-actual-receipt`);
    await startOffer(page, 'Lass uns Malnehmen üben', 'Aufgaben zum Malnehmen');
    await expect(
      page.getByText('Welche Rechnung passt zu 3 Reihen mit je 4 Punkten?'),
    ).toBeVisible();
    const tip = page.getByRole('button', { name: 'Einen Tipp bekommen', exact: true });
    const skin = tip.locator('[dir="auto"]').locator('..');
    const palette = paletteOf(themeNameOf(look.family, look.dark));
    const rgb = (hex: string) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return `${value >> 16}, ${(value >> 8) & 255}, ${value & 255}`;
    };
    await expect(skin).toHaveCSS('background-color', `rgba(${rgb(palette.paper)}, 0.88)`);
    await expect(tip.locator('[dir="auto"]')).toHaveCSS('font-family', /Figtree/);
    await screenShots(page, `foundation-${key}-help-default`);
    await page.getByRole('radio', { name: '3 + 4', exact: true }).click();
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    await expect(page.getByText('Noch nicht ganz – probier', { exact: false })).toBeVisible();
    await page.getByRole('radio', { name: '4 − 3', exact: true }).click();
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    await expect(page.getByText('Schau dir die Punkte genau an.')).toBeVisible();
    await expect(skin).toHaveCSS('background-color', `rgb(${rgb(palette.primaryLt)})`);
    await screenShots(page, `foundation-${key}-help-selected`);
  });
}
