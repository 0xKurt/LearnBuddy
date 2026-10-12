import { expect, test, type Request } from '@playwright/test';

import { PALETTES } from '../../apps/mobile/lib/theme/palettes';
import { signUpMia } from './coreLoop';
import { startOffer } from './figureWalk';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

function rgb(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`;
}

for (const look of SCREEN_LOOKS) {
  const key = `${look.family}-${look.dark ? 'dark' : 'light'}`;
  test(`Option foundation: ${key}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
    await signUpMia(page, `foundation-option-${key}-${Date.now()}@example.test`);
    await screenLook(page, look);
    await startOffer(page, 'Lass uns Malnehmen üben', 'Aufgaben zum Malnehmen');
    const palette = PALETTES[look.dark ? `${look.family}Dark` : look.family];
    const wrong = page.getByRole('radio', { name: '3 + 4', exact: true });
    const right = page.getByRole('radio', { name: '3 · 4', exact: true });
    const frame = wrong.locator(':scope > div');
    const submitted: unknown[] = [];
    const observe = (request: Request) => {
      if (
        request.method() === 'POST' &&
        /\/practice\/sessions\/[^/]+\/answer$/.test(request.url())
      ) {
        submitted.push(request.postDataJSON());
      }
    };
    page.on('request', observe);
    try {
      await expect(frame).toHaveCSS('background-color', rgb(palette.paper));
      const plainText = wrong.getByText('3 + 4', { exact: true });
      await expect(plainText).toHaveCSS('font-size', '16px');
      await expect(plainText).toHaveCSS('line-height', '22px');
      await expect(plainText).toHaveCSS('color', rgb(palette.ink));
      const rows = await page.getByRole('radio').evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        }),
      );
      expect(rows).toHaveLength(4);
      for (let index = 1; index < rows.length; index++) {
        expect(rows[index]!.left).toBe(rows[0]!.left);
        expect(rows[index]!.right).toBe(rows[0]!.right);
        expect(rows[index]!.top).toBeGreaterThanOrEqual(rows[index - 1]!.bottom);
      }
      await screenShots(page, `options-${key}-idle`);
      await wrong.click();
      await expect(wrong).toBeChecked();
      await expect(frame).toHaveCSS('background-color', rgb(palette.primaryLt));
      expect(submitted).toEqual([]);
      await screenShots(page, `options-${key}-selected`);
      expect(submitted).toEqual([]);
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
      await expect(page.getByText('Noch nicht ganz – probier', { exact: false })).toBeVisible();
      expect(submitted).toHaveLength(1);
      await expect(wrong).toHaveAttribute('aria-disabled', 'true');
      await expect(frame).toHaveCSS('opacity', '0.6');
      await expect(plainText).toHaveCSS('color', rgb(palette.ink));
      await screenShots(page, `options-${key}-tried-dim`);
      await page.getByRole('button', { name: 'Lösung zeigen', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeVisible();
      expect(submitted).toHaveLength(1);
      await expect(right.locator(':scope > div')).toHaveCSS('background-color', rgb(palette.mint));
      await expect(frame).toHaveCSS('background-color', rgb(palette.blush));
      await expect(frame).toHaveCSS('opacity', '1');
      const badgeBeforeText = await frame.evaluate((surface) => {
        const badge = surface.firstElementChild?.getBoundingClientRect();
        const label = surface.lastElementChild?.getBoundingClientRect();
        return Boolean(badge && label && badge.right <= label.left);
      });
      expect(badgeBeforeText).toBe(true);
      await expect(right.locator(':scope > div')).toHaveCSS('opacity', '1');
      await screenShots(page, `options-${key}-settled-correct-wrong`);
    } finally {
      page.off('request', observe);
    }
  });
}
