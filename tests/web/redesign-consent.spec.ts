import { expect, test, type Page } from '@playwright/test';
import { freshEmail } from './coreLoop';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import authDe from '../../apps/mobile/locales/de/auth.json';
import { PHONES, shot } from './fit';

async function cssColor(page: Page, value: string) {
  return page.evaluate((color) => {
    const swatch = document.createElement('span');
    swatch.style.color = color;
    document.body.append(swatch);
    const result = getComputedStyle(swatch).color;
    swatch.remove();
    return result;
  }, value);
}

for (const family of ['pastell', 'ocean'] as const) {
  for (const mode of ['light', 'dark'] as const) {
    test(`Consent ${family} ${mode}: real signup, explicit agreement and continue`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ family, mode }) => {
          localStorage.setItem('lb.theme', family);
          localStorage.setItem('lb.themeMode', mode);
        },
        { family, mode },
      );
      await page.goto('/');
      await page.getByLabel('E-Mail', { exact: true }).fill(freshEmail('consent-design'));
      await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
      await page.getByLabel('Passwort wiederholen', { exact: true }).fill('geheim-1234');
      await page.getByRole('button', { name: 'Konto erstellen', exact: true }).click();
      await expect(page.getByText('Kurz zum Datenschutz', { exact: true })).toBeVisible();
      const palette = paletteOf(themeNameOf(family, mode === 'dark'));
      const heading = page.getByRole('heading', { name: 'Kurz zum Datenschutz', exact: true });
      await expect(heading).toHaveCSS('color', await cssColor(page, palette.ink));
      await expect(heading).toHaveCSS('font-family', /Figtree_800ExtraBold/);
      const checkbox = page.getByRole('checkbox', {
        name: 'Ich habe das gelesen und bin einverstanden.',
        exact: true,
      });
      const next = page.getByRole('button', { name: 'Weiter', exact: true });
      await expect(checkbox).not.toBeChecked();
      await expect(next).toBeDisabled();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        const box = await checkbox.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        const action = await next.boundingBox();
        expect(action).not.toBeNull();
        expect(action!.y + action!.height).toBeLessThanOrEqual(phone.height);
        const footerTop = (await checkbox.boundingBox())!.y;
        for (const point of [
          'point_data',
          'point_photos',
          'point_ai',
          'point_voice',
          'point_contact',
          'point_control',
        ] as const) {
          const fact = page.getByText(authDe.consent[point], { exact: true });
          await fact.scrollIntoViewIfNeeded();
          const factBox = await fact.boundingBox();
          expect(factBox).not.toBeNull();
          expect(factBox!.y).toBeGreaterThanOrEqual(0);
          expect(factBox!.y + factBox!.height).toBeLessThanOrEqual(footerTop);
        }
        const policy = page.getByRole('button', { name: authDe.consent.full_policy, exact: true });
        await policy.scrollIntoViewIfNeeded();
        const policyBox = await policy.boundingBox();
        expect(policyBox).not.toBeNull();
        expect(policyBox!.y).toBeGreaterThanOrEqual(0);
        expect(policyBox!.y + policyBox!.height).toBeLessThanOrEqual(footerTop);
        await shot(page, `consent-${family}-${mode}-facts-bottom-${phone.width}`, {
          phones: [phone],
        });
        await page.getByTestId('scroll-list').evaluate((element) => (element.scrollTop = 0));
        await shot(page, `consent-${family}-${mode}-unchecked-${phone.width}`, { phones: [phone] });
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await checkbox.hover();
      await page.mouse.down();
      try {
        await expect
          .poll(() =>
            checkbox.evaluate((element) => {
              const box = element.querySelector<HTMLElement>('[style*="transform"]');
              return box ? getComputedStyle(box).transform : null;
            }),
          )
          .toBe('matrix(1, 0, 0, 1, 0, 0)');
      } finally {
        await page.mouse.up();
      }
      await expect(checkbox).toBeChecked();
      const primaryCss = await cssColor(page, palette.primary);
      await expect
        .poll(() =>
          next.evaluate(
            (element, expected) =>
              [element, ...element.querySelectorAll('*')].some(
                (node) => getComputedStyle(node).backgroundColor === expected,
              ),
            primaryCss,
          ),
        )
        .toBe(true);
      await expect(next).toBeEnabled();
      await checkbox.click();
      await expect(next).toBeDisabled();
      await checkbox.click();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await shot(page, `consent-${family}-${mode}-checked-${phone.width}`, { phones: [phone] });
      }
      await next.click();
      await expect(page.getByText('Wer lernt mit LearnBuddy?', { exact: true })).toBeVisible();
    });
  }
}

test('Consent decline signs out without accepting and returns to Welcome', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-Mail', { exact: true }).fill(freshEmail('consent-decline'));
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen', { exact: true }).fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen', exact: true }).click();
  await expect(page.getByText('Kurz zum Datenschutz', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nicht einverstanden – abmelden', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Konto erstellen', exact: true })).toBeVisible();
});
