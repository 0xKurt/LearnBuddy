// Prepared against real dev-stack scenarios; execute only after ordered integration.
import { expect, test } from '@playwright/test';
import { onboardChild, startOffer } from './figureWalk';
import { PHONES, shot } from './fit';
import { SCREEN_LOOKS, screenLook, screenShots, screenTargets } from './redesign-screen-matrix';
import { PALETTES } from '../../apps/mobile/lib/theme/palettes';

for (const look of SCREEN_LOOKS) {
  const { family, dark } = look;
  test(`practice-screen · ${family} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await onboardChild(page, 'practice-screen');
    await screenLook(page, look);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const key = dark ? `${family}Dark` : family;
    await startOffer(page, 'Lass uns Schemata üben', 'Schemata mit Lücken');
    await expect(page.getByText('Wasserkreislauf in Lücke A', { exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Schemata', exact: true })).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: 'Was gehört im Wasserkreislauf in Lücke A?', exact: true }),
    ).toHaveCount(1);
    await expect(page.locator('[data-testid="composer-primary"]:visible')).toHaveCount(1);
    await expect(page.getByTestId('progress-row')).toHaveCount(1);
    await expect(page.getByTestId('progress-bar')).toBeVisible();
    const figure = page.getByRole('button', { name: /^Abbildung:.*Kreislauf/ });
    await expect(figure).toBeVisible();
    await screenShots(page, `practice-screen-${key}-figure`);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await figure.click();
      await expect(
        page.getByText('Mit zwei Fingern vergrößern, doppelt tippen zum Heranzoomen.'),
      ).toBeVisible();
      // Toggle while mounted: the viewer must retain the same drawing and close once.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(
        page.getByRole('img', { name: /Kreislauf mit 4 Kästchen/ }).last(),
      ).toBeVisible();
      await screenTargets(page);
      await shot(page, `practice-screen-${key}-zoom-${phone.width}`, {
        opened: true,
        phones: [phone],
      });
      await page.getByRole('button', { name: 'Schließen', exact: true }).click();
      await expect(
        page.getByText('Mit zwei Fingern vergrößern, doppelt tippen zum Heranzoomen.'),
      ).toBeHidden();
      await expect(page.getByLabel('Deine Antwort')).toBeVisible();
    }
    await page.getByLabel('Deine Antwort').fill('Kondensation');
    const check = page.getByRole('button', { name: 'Prüfen', exact: true });
    const colour = parseInt(PALETTES[key as keyof typeof PALETTES].primary.slice(1), 16);
    await expect
      .poll(() =>
        check.evaluate((button) => getComputedStyle(button.firstElementChild!).backgroundColor),
      )
      .toBe(`rgb(${colour >> 16}, ${(colour >> 8) & 255}, ${colour & 255})`);
    await check.click();
    await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="composer-primary"]:visible')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeVisible();
    await expect(
      page.getByTestId('thread-turn').filter({ hasText: 'Kondensation' }),
    ).not.toHaveCount(0);
    await screenShots(page, `practice-screen-${key}-feedback`);
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByText('Wasserkreislauf in Lücke B', { exact: false })).toBeVisible();
    // Nothing typed yet: the one primary slot holds the conversation button, "Prüfen" comes
    // with her first letter (#599).
    await expect(page.getByRole('button', { name: 'Prüfen', exact: true })).toHaveCount(0);
    await expect(
      page
        .locator('[data-testid="composer-primary"]:visible')
        .getByRole('button', { name: 'Mit Buddy sprechen', exact: true }),
    ).toBeVisible();
  });
}
