import { expect, test, type Page } from '@playwright/test';
import { PHONES, shot } from './fit';
import {
  ONBOARDING_LOOKS,
  onboardingStart,
  onboardingShots,
  onboardingReducedPress,
} from './redesign-onboarding-matrix';
async function reachableFields(page: Page) {
  const next = page.getByRole('button', { name: 'Weiter', exact: true });
  for (const input of await page.locator('input:visible').all()) {
    await input.scrollIntoViewIfNeeded();
    await input.focus();
    const field = await input.boundingBox();
    const action = await next.boundingBox();
    expect(field).not.toBeNull();
    expect(action).not.toBeNull();
    expect(field!.y).toBeGreaterThanOrEqual(0);
    expect(action!.y).toBeGreaterThanOrEqual(0);
    expect(action!.y + action!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(field!.y + field!.height).toBeLessThanOrEqual(action!.y);
    const insideClips = await input.evaluate((element) => {
      const field = element.getBoundingClientRect();
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (!/(auto|scroll|hidden)/.test(style.overflowY)) continue;
        const clip = parent.getBoundingClientRect();
        if (field.top < clip.top - 1 || field.bottom > clip.bottom + 1) return false;
      }
      return true;
    });
    expect(insideClips, 'focused field is whole inside its effective scroll clip').toBe(true);
  }
}
for (const look of ONBOARDING_LOOKS)
  test(`Parent Profile ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(240_000);
    await onboardingStart(page, look);
    await page.getByRole('radio', { name: 'Mein Kind' }).click();
    const next = page.getByRole('button', { name: 'Weiter', exact: true });
    await expect(next).toBeDisabled();
    await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Mia');
    await page.getByRole('button', { name: 'Bundesland wählen' }).click();
    await page.getByRole('radio', { name: 'Niedersachsen' }).click();
    // Exercise the long real value before returning to the intended required region.
    await page.getByRole('button', { name: 'Bundesland: Niedersachsen', exact: true }).click();
    await page.getByRole('radio', { name: 'Mecklenburg-Vorpommern', exact: true }).click();
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      const label = page.getByText('Mecklenburg-Vorpommern', { exact: true });
      await label.scrollIntoViewIfNeeded();
      await expect(label).toHaveCSS('font-size', '16px');
      const whole = await label.evaluate((element) => {
        const target = element.closest('[role="button"]')!.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()].every(
          (line) =>
            line.left >= target.left &&
            line.right <= target.right &&
            line.top >= target.top &&
            line.bottom <= target.bottom,
        );
      });
      expect(whole, 'long selected region remains whole in the form control').toBe(true);
      await reachableFields(page);
      await shot(page, `profile-region-long-${look.family}-${look.dark}-${phone.width}`, {
        phones: [phone],
      });
    }
    await page
      .getByRole('button', { name: 'Bundesland: Mecklenburg-Vorpommern', exact: true })
      .click();
    await page.getByRole('radio', { name: 'Niedersachsen', exact: true }).click();
    await page.getByLabel('Tag', { exact: true }).fill('31');
    await page.getByLabel('Monat', { exact: true }).fill('02');
    await page.getByLabel('Jahr', { exact: true }).fill('2013');
    await expect(page.getByText('Bitte prüf das Datum.')).toBeVisible();
    await expect(next).toBeDisabled();
    await onboardingShots(page, `profile-${look.family}-${look.dark}-invalid-date`, look);
    await page.getByRole('button', { name: /Deutsch/ }).click();
    await expect(
      page.getByRole('radiogroup', { name: 'Sprache', exact: true }).getByRole('radio'),
    ).toHaveCount(5);
    await page.getByRole('radio', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: /English/ }).click();
    await expect(page.getByRole('radio', { name: 'English', exact: true })).toBeChecked();
    await page.getByRole('radio', { name: 'Deutsch', exact: true }).click();
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await reachableFields(page);
    }
    // Required region and valid date are saved through the real controller.
    await page.getByLabel('Tag', { exact: true }).fill('14');
    await page.getByLabel('Monat', { exact: true }).fill('03');
    await page.getByLabel('Jahr', { exact: true }).fill('2013');
    await expect(next).toBeEnabled();
    await next.click();
    await expect(next).toBeDisabled();
    await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
    await page.getByLabel('PIN der Eltern').fill('4826');
    await page.getByLabel('PIN wiederholen').fill('4827');
    await expect(page.getByText('Die PINs stimmen nicht überein. Bitte nochmal.')).toBeVisible();
    await expect(next).toBeDisabled();
    await onboardingShots(page, `profile-${look.family}-${look.dark}-pin-mismatch`, look);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await reachableFields(page);
      const back = await page.getByRole('button', { name: 'Zurück', exact: true }).boundingBox();
      expect(back).not.toBeNull();
      expect(back!.x).toBe(16);
      expect(back!.width).toBe(44);
      expect(back!.height).toBe(44);
      await shot(page, `profile-parent-fields-${look.family}-${look.dark}-${phone.width}`, {
        phones: [phone],
      });
    }
    await page.setViewportSize({ width: 360, height: 420 });
    await reachableFields(page);
    await shot(page, `profile-parent-keyboard-${look.family}-${look.dark}`, {
      phones: [{ width: 360, height: 420 }],
    });
    await page.setViewportSize(PHONES[0]);
    // Consent is already checked; correct repeat then submit exactly once.
    await page.getByLabel('PIN wiederholen').fill('4826');
    await onboardingReducedPress(page, 'Weiter');
    await next.click();
    await expect(page.getByText('Darf Buddy Mia Benachrichtigungen schicken?')).toBeVisible();
  });
