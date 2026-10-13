// Real practice header/composer, against the local API and scripted worksheet fixtures.
import { expect, test } from '@playwright/test';

import { freshEmail, openMenu, planTest, sendWorksheet, signUpMia } from './coreLoop';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
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
      // Nothing to check yet: the one slot holds the blue conversation button (#599), and
      // "Prüfen" takes its place with the first digit.
      await expect(
        primary.getByRole('button', { name: 'Mit Buddy sprechen', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Prüfen', exact: true })).toHaveCount(0);
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
      // Chromium's auto outline can paint despite outline-width:0: suppress the inner textarea's.
      await expect(answer).toHaveCSS('outline-style', 'solid');
      await expect(answer).toHaveCSS('outline-width', '0px');
      // The Composer's box has no focus state (design components/composer/Composer.jsx:39–40):
      // a hairline at rest and with the focus, no ring around it.
      const hairline = paletteOf(
        themeNameOf(family === 'Pastell' ? 'pastell' : 'ocean', dark),
      ).hairlineStrong;
      expect(
        await answer.evaluate((element, color) => {
          const probe = document.createElement('span');
          probe.style.color = color;
          document.body.append(probe);
          const expected = getComputedStyle(probe).color;
          probe.remove();
          const box = element.parentElement!.parentElement!;
          const style = getComputedStyle(box);
          return {
            hairline: style.borderTopColor === expected,
            ring: parseFloat(style.outlineWidth) || 0,
            radius: style.borderTopLeftRadius,
          };
        }, hairline),
        'the focused Composer keeps its hairline and gets no ring',
      ).toEqual({ hairline: true, ring: 0, radius: '26px' });
      // "Prüfen": the 40 pt pill with its sign, inside a 44 pt target.
      const pill = primary.getByRole('button', { name: 'Prüfen', exact: true });
      expect(
        await pill.evaluate((element) => ({
          target: Math.round(element.getBoundingClientRect().height),
          face: Math.round(element.firstElementChild!.getBoundingClientRect().height),
          sign: element.querySelectorAll('svg').length,
        })),
      ).toEqual({ target: 44, face: 40, sign: 1 });
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
