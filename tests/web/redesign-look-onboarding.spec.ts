import { expect, test } from '@playwright/test';
import {
  ONBOARDING_LOOKS,
  onboardingStart,
  onboardingShots,
  childToParent,
  parentToContact,
} from './redesign-onboarding-matrix';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
for (const look of ONBOARDING_LOOKS)
  test(`Look intro ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(240_000);
    await onboardingStart(page, look);
    await childToParent(page);
    await parentToContact(page);
    await page.getByRole('button', { name: 'Ja, erlauben' }).click();
    await page.getByRole('button', { name: "Los geht's, Mia!" }).click();
    if (process.env.LB_DEV_SPEECH === 'fake')
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByText('Sag es Buddy einfach', { exact: true })).toBeVisible();
    for (let stage = 0; stage < 3; stage++) {
      await onboardingShots(page, `intro-${look.family}-${look.dark}-${stage}`, look);
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
    await expect(page.getByText('Such dir deine Farben aus', { exact: true })).toBeVisible();
    const family = page.getByRole('radio', {
      name: look.family === 'ocean' ? 'Meer' : 'Pastell',
      exact: true,
    });
    await family.click();
    await expect(family).toBeChecked();
    const mode = page.getByRole('radio', { name: look.dark ? 'Dunkel' : 'Hell', exact: true });
    await mode.click();
    await expect(mode).toBeChecked();
    await onboardingShots(page, `look-${look.family}-${look.dark}`, look);
    await page.getByRole('radio', { name: 'Wie das Handy', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Wie das Handy', exact: true })).toBeChecked();
    await page.emulateMedia({ colorScheme: look.dark ? 'dark' : 'light' });
    // OS appearance changes rebuild native views; wait for the actual palette paint.
    const primary = Number.parseInt(
      paletteOf(themeNameOf(look.family, look.dark)).primary.slice(1),
      16,
    );
    const expectedPrimary = `rgb(${primary >> 16}, ${(primary >> 8) & 255}, ${primary & 255})`;
    await expect
      .poll(
        () =>
          page
            .getByRole('button', { name: "Los geht's", exact: true })
            .evaluate(
              (element, color) =>
                [element, ...element.querySelectorAll('*')].some(
                  (node) => getComputedStyle(node).backgroundColor === color,
                ),
              expectedPrimary,
            ),
        { message: 'System OS change settles on actual selected family palette' },
      )
      .toBe(true);
    await onboardingShots(page, `look-system-${look.family}-${look.dark}`, look);
    await mode.click();
    await expect(mode).toBeChecked();
    await page.getByRole('button', { name: "Los geht's", exact: true }).click();
    await expect(page.getByText('LearnBuddy', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('LearnBuddy', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => ({
        family: localStorage.getItem('lb.theme'),
        mode: localStorage.getItem('lb.themeMode'),
      })),
    ).toEqual({ family: look.family, mode: look.dark ? 'dark' : 'light' });
    const v = Number.parseInt(paletteOf(themeNameOf(look.family, look.dark)).ink.slice(1), 16);
    await expect(page.getByText('LearnBuddy', { exact: true })).toHaveCSS(
      'color',
      `rgb(${v >> 16}, ${(v >> 8) & 255}, ${v & 255})`,
    );
  });
