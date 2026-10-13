import { expect, test, type Page } from '@playwright/test';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import { PHONES, shot } from './fit';

async function initialFieldsWhole(page: Page): Promise<void> {
  const action = await page.getByTestId('auth-primary').boundingBox();
  expect(action).not.toBeNull();
  for (const label of ['E-Mail', 'Passwort', 'Passwort wiederholen']) {
    const box = await page.getByLabel(label, { exact: true }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(action!.y);
  }
}

async function formReachable(page: Page): Promise<void> {
  const action = page.getByTestId('auth-primary');
  await expect(action).toBeVisible();
  const button = await action.boundingBox();
  expect(button).not.toBeNull();
  expect(button!.y + button!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  for (const field of await page.locator('input:visible').all()) {
    await field.scrollIntoViewIfNeeded();
    const box = await field.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(button!.y);
  }
  await page.getByTestId('scroll-form').evaluate((element) => (element.scrollTop = 0));
}

for (const family of ['pastell', 'meer'] as const) {
  for (const mode of ['light', 'dark'] as const) {
    test(`Welcome ${family} ${mode}: signup, validation, language and signin`, async ({ page }) => {
      await page.addInitScript(
        ({ family, mode }) => {
          localStorage.setItem('lb.theme', family);
          localStorage.setItem('lb.themeMode', mode);
        },
        { family: family === 'meer' ? 'ocean' : family, mode },
      );
      await page.goto('/');
      await expect(page.getByLabel('E-Mail', { exact: true })).toBeVisible();
      // An address to type, as the design shows it (Welcome.jsx:20), and the margin of the pages
      // before the app (tokens/space.css `--space-gutter`, #599).
      await expect(page.getByLabel('E-Mail', { exact: true })).toHaveAttribute(
        'placeholder',
        'name@beispiel.de',
      );
      const heading = await page.getByRole('heading').first().boundingBox();
      expect(heading).not.toBeNull();
      expect(heading!.x).toBe(20);
      const expectedPrimary = paletteOf(
        themeNameOf(family === 'meer' ? 'ocean' : family, mode === 'dark'),
      ).primary;
      await page.getByLabel('E-Mail', { exact: true }).fill('theme-proof@example.test');
      await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
      await page.getByLabel('Passwort wiederholen', { exact: true }).fill('geheim-1234');
      await expect
        .poll(() =>
          page.getByTestId('auth-primary').evaluate((element, expected) => {
            const swatch = document.createElement('span');
            swatch.style.color = expected;
            document.body.append(swatch);
            const color = getComputedStyle(swatch).color;
            swatch.remove();
            return [element, ...element.querySelectorAll('*')].some(
              (node) => getComputedStyle(node).backgroundColor === color,
            );
          }, expectedPrimary),
        )
        .toBe(true);
      await page.getByLabel('E-Mail', { exact: true }).fill('');
      await page.getByLabel('Passwort', { exact: true }).fill('');
      await page.getByLabel('Passwort wiederholen', { exact: true }).fill('');
      await page.getByLabel('Passwort wiederholen', { exact: true }).blur();
      const prefix = `welcome-${family}-${mode}`;
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await page.getByTestId('scroll-form').evaluate((element) => (element.scrollTop = 0));
        await initialFieldsWhole(page);
        await formReachable(page);
        await shot(page, `${prefix}-signup-${phone.width}`, { phones: [phone] });
      }
      await page.getByRole('button', { name: /Deutsch/ }).click();
      await expect(page.getByRole('radio', { name: 'Deutsch', exact: true })).toBeChecked();
      await expect(
        page.getByRole('radiogroup', { name: 'Sprache wählen', exact: true }).getByRole('radio'),
      ).toHaveCount(5);
      await shot(page, `${prefix}-language`);
      await page.getByRole('radio', { name: 'English', exact: true }).click();
      await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /English/ }).click();
      await page.getByRole('radio', { name: 'Deutsch', exact: true }).click();
      await page.getByLabel('E-Mail', { exact: true }).fill('falsch');
      await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
      await page.getByLabel('Passwort wiederholen', { exact: true }).fill('anders-1234');
      await page.getByLabel('Passwort wiederholen', { exact: true }).blur();
      await expect(page.getByText('Die beiden Passwörter sind noch nicht gleich.')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Konto erstellen', exact: true }),
      ).toBeDisabled();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await formReachable(page);
        await shot(page, `${prefix}-errors-${phone.width}`, { phones: [phone] });
        await page
          .getByTestId('scroll-form')
          .evaluate((element) => (element.scrollTop = element.scrollHeight));
        await expect
          .poll(() =>
            page
              .getByTestId('scroll-form')
              .evaluate((element) =>
                Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop),
              ),
          )
          .toBeLessThanOrEqual(1);
        const mismatch = await page
          .getByText('Die beiden Passwörter sind noch nicht gleich.')
          .boundingBox();
        const action = await page.getByTestId('auth-primary').boundingBox();
        expect(mismatch).not.toBeNull();
        expect(action).not.toBeNull();
        expect(mismatch!.y).toBeGreaterThanOrEqual(0);
        expect(mismatch!.y + mismatch!.height).toBeLessThanOrEqual(action!.y);
        await shot(page, `${prefix}-errors-bottom-${phone.width}`, { phones: [phone] });
      }
      await page.getByRole('radio', { name: 'Anmelden', exact: true }).click();
      await expect(page.getByLabel('Passwort wiederholen', { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Passwort vergessen?', exact: true }),
      ).toBeVisible();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await formReachable(page);
        await shot(page, `${prefix}-signin-${phone.width}`, { phones: [phone] });
      }
    });
  }
}

test('Welcome invalid signin: real local auth error keeps fields and permits retry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radio', { name: 'Anmelden', exact: true }).click();
  const email = `missing-welcome-${Date.now()}@example.test`;
  await page.getByLabel('E-Mail', { exact: true }).fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  const submit = page.getByRole('button', { name: 'Anmelden', exact: true });
  await submit.click();
  await expect(page.getByText('E-Mail oder Passwort stimmen nicht.')).toBeVisible();
  await expect(page.getByLabel('E-Mail', { exact: true })).toHaveValue(email);
  await expect(page.getByLabel('Passwort', { exact: true })).toHaveValue('geheim-1234');
  await expect(submit).toBeEnabled();
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await formReachable(page);
    await shot(page, `welcome-invalid-signin-${phone.width}`, { phones: [phone] });
  }
});
