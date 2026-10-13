import { expect, test, type Page } from '@playwright/test';
import { PHONES, shot } from './fit';
import { freshEmail, signUpMia, planTest, sendWorksheet } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import { LISTENING } from './talk';

const glow = (page: Page) =>
  page.locator('svg[viewBox="0 0 100 100"][preserveAspectRatio="none"]').filter({ visible: true });
for (const look of SCREEN_LOOKS)
  test(`background ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    await signUpMia(page, freshEmail('background'));
    const key = await screenLook(page, look);
    await expect(glow(page)).toHaveCount(1);
    await expect(glow(page).locator('radialGradient')).toHaveCount(3);
    await expect(glow(page).locator('rect')).toHaveCount(3);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      const bar = page.getByTestId('composer');
      await expect(bar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const footer = await bar.boundingBox();
      const ground = await glow(page).boundingBox();
      expect(footer).not.toBeNull();
      expect(ground).not.toBeNull();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(ground!.y + ground!.height + 1);
    }
    await screenShots(page, `background-${key}`);
  });

test('background responds to the real live reduced-transparency media event', async ({ page }) => {
  await signUpMia(page, freshEmail('background-transparency'));
  await expect(glow(page)).toHaveCount(1);
  const media = await page.context().newCDPSession(page);
  await media.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  await expect
    .poll(() => page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches))
    .toBe(true);
  await expect(glow(page)).toHaveCount(0);
  await media.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }],
  });
  await expect(glow(page)).toHaveCount(1);
  await media.detach();
});

// Custom roots use the same renderer as Screen; exercise their real route shells.
test('full-page background covers Welcome, invalid Reset, Talk and Practice', async ({ page }) => {
  async function rootShot(name: string) {
    await expect(glow(page)).toHaveCount(1);
    await expect(glow(page).locator('radialGradient')).toHaveCount(3);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await expect
        .poll(async () => {
          const box = await glow(page).boundingBox();
          return box !== null && box.y <= 1 && box.y + box.height >= phone.height - 1;
        })
        .toBe(true);
      await shot(page, `background-root-${name}-${phone.width}`, { phones: [phone] });
    }
  }
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Konto erstellen' })).toBeVisible();
  await rootShot('welcome');
  await page.goto('/reset-password?error=access_denied&error_code=otp_expired');
  await expect(page.getByRole('button', { name: 'Neuen Link schicken' })).toBeVisible();
  await rootShot('reset');
  await signUpMia(page, freshEmail('background-roots'));
  await page.getByRole('button', { name: 'Mit Buddy sprechen' }).click();
  await expect(page.getByText(LISTENING)).toBeVisible();
  await rootShot('talk');
  await page.getByRole('button', { name: 'Beenden', exact: true }).click();
  await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
  await planTest(page);
  await sendWorksheet(page);
  await page.getByRole('button', { name: 'Jetzt üben' }).click();
  await expect(page.getByText('Frage 1 von 4')).toBeVisible();
  await rootShot('practice');
});

// Real conversation keeps optional first-visit content out of this viewport regression.
test('background follows the real Home viewport above the keyboard', async ({ page }) => {
  await signUpMia(page, freshEmail('background-keyboard'));
  await planTest(page);
  const input = page.getByLabel('Schreib Buddy …');
  await input.focus();
  await expect(input).toBeFocused();
  await page.setViewportSize({ width: 360, height: 440 });
  await expect(glow(page)).toHaveCount(1);
  await expect
    .poll(() =>
      glow(page).evaluate((svg) => {
        const layer = svg.parentElement!;
        const root = layer.parentElement!;
        const bounds = [svg, layer, root].map((node) => node.getBoundingClientRect());
        const rootBounds = bounds[2]!;
        return (
          bounds.every(
            (box) =>
              box.top >= -1 &&
              box.bottom <= innerHeight + 1 &&
              box.left >= -1 &&
              box.right <= innerWidth + 1,
          ) &&
          bounds
            .slice(0, 2)
            .every((box) => box.top >= rootBounds.top - 1 && box.bottom <= rootBounds.bottom + 1) &&
          document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1
        );
      }),
    )
    .toBe(true);
  await shot(page, 'background-home-keyboard', { phones: [{ width: 360, height: 440 }] });
  await input.blur();
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await expect
      .poll(async () => {
        const ground = await glow(page).boundingBox();
        const footer = await page.getByTestId('composer').boundingBox();
        return (
          ground !== null &&
          footer !== null &&
          ground.y <= 1 &&
          ground.y + ground.height <= phone.height + 1 &&
          footer.y + footer.height <= ground.y + ground.height + 1
        );
      })
      .toBe(true);
    await shot(page, `background-home-restored-${phone.width}`, { phones: [phone] });
  }
});
