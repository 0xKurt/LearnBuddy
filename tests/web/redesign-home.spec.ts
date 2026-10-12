import { expect, test } from '@playwright/test';
import buddyDe from '../../apps/mobile/locales/de/buddy.json';
import { freshEmail, signUpMia } from './coreLoop';
import { shot } from './fit';
import { onboardingReducedPress } from './redesign-onboarding-matrix';
import { SCREEN_LOOKS, screenLook, screenShots, screenTargets } from './redesign-screen-matrix';
for (const look of SCREEN_LOOKS)
  test(`first Home: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    await signUpMia(page, freshEmail('home-redesign'));
    const key = await screenLook(page, look);
    await expect(
      page.getByRole('button', { name: 'Ich schreibe bald eine Arbeit', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /Hallo Mia\./ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Foto vom Arbeitsblatt', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Einfach mal üben', exact: true })).toBeVisible();
    await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
    await screenShots(page, `home-first-${key}`);
    await onboardingReducedPress(page, buddyDe.talk.open);
    // The starter invokes the actual camera flow; selecting no file leaves no invented material.
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Foto vom Arbeitsblatt', exact: true }).click();
    await chooser;
    await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toHaveCount(0);
  });

test('first Home keeps the actual40-character learner greeting whole at360', async ({ page }) => {
  const name = 'Alexandra Maximiliane Elisabeth Johannes';
  expect(name).toHaveLength(40);
  await page.setViewportSize({ width: 360, height: 740 });
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/v1/learner') && r.request().method() === 'POST',
  );
  await signUpMia(page, freshEmail('home-long-name'), name);
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({ display_name: name });
  expect(await response.json()).toMatchObject({ display_name: name });
  await screenLook(page, SCREEN_LOOKS[0]);
  const greeting = page.getByRole('heading', { name: `Hallo ${name}. Was steht an?`, exact: true });
  await expect(greeting).toBeVisible();
  expect(
    await greeting.evaluate(
      (element) =>
        element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth,
    ),
    'full saved greeting has no clipped text',
  ).toBe(true);
  for (const label of [
    'Ich schreibe bald eine Arbeit',
    'Foto vom Arbeitsblatt',
    'Einfach mal üben',
  ]) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeInViewport();
  }
  await expect(page.getByLabel('Schreib Buddy …')).toBeInViewport();
  await screenTargets(page);
  await shot(page, 'home-first-long-name-360', { phones: [{ width: 360, height: 740 }] });
});
