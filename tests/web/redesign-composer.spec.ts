// Real practice header/composer, against the local API and scripted worksheet fixtures.
import { expect, test } from '@playwright/test';

import { freshEmail, openMenu, planTest, sendWorksheet, signUpMia } from './coreLoop';
import { PHONES, shot } from './fit';

for (const family of ['Pastell', 'Meer'] as const) {
  for (const dark of [false, true]) {
    test(`Composer practice · ${family} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
      await signUpMia(page, freshEmail('composer'));
      await openMenu(page, 'Einstellungen');
      await page.getByRole('radio', { name: family, exact: true }).click();
      const mode = page.getByRole('radio', { name: dark ? 'Dunkel' : 'Hell', exact: true });
      await mode.click();
      await expect(mode).toBeChecked();
      await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      const message = page.getByLabel('Schreib Buddy …');
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        for (const text of ['', 'Meine Frage']) {
          await message.fill(text);
          const box = await message.boundingBox();
          expect(box, 'mounted Composer edit target').not.toBeNull();
          expect(
            box!.height,
            'empty and typed Composer edit target remains44pt',
          ).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(44);
        }
      }
      await message.fill('');
      await planTest(page);
      await sendWorksheet(page);
      await page.getByRole('button', { name: 'Jetzt üben' }).click();
      await expect(page.getByText('Frage 1 von 4', { exact: true })).toHaveCount(1);
      const primary = page.locator('[data-testid="composer-primary"]:visible');
      await expect(primary).toHaveCount(1);
      await expect(primary.getByRole('button', { name: 'Prüfen', exact: true })).toBeDisabled();
      await expect(
        page.locator('[data-testid="progress-bar"]:visible [role="progressbar"]'),
      ).toHaveAttribute('aria-valuenow', '0.5');
      await expect(primary.getByRole('button')).toHaveCount(1);

      // The overflow delegates to the existing flag confirmation; cancel leaves the question.
      await page.getByRole('button', { name: 'Mehr', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Frage passt nicht', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Frage passt nicht', exact: true }).click();
      await expect(page.getByText('Frage passt nicht?', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Rausnehmen', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Rausnehmen', exact: true })).toBeHidden();
      await expect(
        page.getByRole('button', { name: 'Frage passt nicht', exact: true }),
      ).toBeHidden();
      await expect(page.getByText('Frage 1 von 4', { exact: true })).toHaveCount(1);

      const answer = page.getByLabel('Deine Antwort');
      await answer.fill('0,75');
      // Chromium's auto outline can paint despite outline-width:0; the shared frame
      // supplies the visible theme halo, so suppress only the inner textarea outline.
      await expect(answer).toHaveCSS('outline-style', 'solid');
      await expect(answer).toHaveCSS('outline-width', '0px');
      expect(
        await answer.evaluate((element) => {
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (style.outlineStyle === 'solid' && parseFloat(style.outlineWidth) > 0) return true;
          }
          return false;
        }),
        'focused Composer retains its visible outer theme halo',
      ).toBe(true);
      await expect(primary.getByRole('button', { name: 'Prüfen', exact: true })).toBeEnabled();
      const name = `composer-${family.toLowerCase()}-${dark ? 'dark' : 'light'}`;
      await shot(page, `${name}-check`);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await expect(primary.getByRole('button')).toHaveCount(1);
        await expect(primary.getByRole('button', { name: 'Prüfen', exact: true })).toBeInViewport();
      }
      await primary.getByRole('button', { name: 'Prüfen', exact: true }).click();
      await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
      await expect(
        page.locator('[data-testid="progress-bar"]:visible [role="progressbar"]'),
      ).toHaveAttribute('aria-valuenow', '1');
      await expect(primary.getByRole('button', { name: 'Weiter', exact: true })).toBeVisible();
      await expect(primary.getByRole('button')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Prüfen', exact: true })).toHaveCount(0);
      await shot(page, `${name}-next`);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await expect(primary.getByRole('button', { name: 'Weiter', exact: true })).toBeInViewport();
      }
      await primary.getByRole('button', { name: 'Weiter', exact: true }).click();
      await expect(page.getByText('Frage 2 von 4', { exact: true })).toBeVisible();
      await expect(
        page.locator('[data-testid="progress-bar"]:visible [role="progressbar"]'),
      ).toHaveAttribute('aria-valuenow', '1.5');
    });
  }
}
