import { expect, test, type Page } from '@playwright/test';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import { PHONES, shot } from './fit';

const confirmation =
  'Wenn es ein Konto mit dieser Adresse gibt, kommt gleich eine E-Mail zum Zurücksetzen.';
const requestName = 'Neuen Link schicken';

async function semanticColor(page: Page, locator: ReturnType<Page['getByText']>, expected: string) {
  const expectedCss = await page.evaluate((value) => {
    const swatch = document.createElement('span');
    swatch.style.color = value;
    document.body.append(swatch);
    const color = getComputedStyle(swatch).color;
    swatch.remove();
    return color;
  }, expected);
  await expect(locator).toHaveCSS('color', expectedCss);
}

async function wholeAboveAction(page: Page, locator: ReturnType<Page['getByText']>) {
  const box = await locator.boundingBox();
  const action = await page.getByRole('button', { name: requestName, exact: true }).boundingBox();
  expect(box).not.toBeNull();
  expect(action).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(action!.y);
  expect(action!.y + action!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

for (const family of ['pastell', 'ocean'] as const) {
  for (const mode of ['light', 'dark'] as const) {
    test(`Reset ${family} ${mode}: invalid link, inline error and generic resend`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ family, mode }) => {
          localStorage.setItem('lb.theme', family);
          localStorage.setItem('lb.themeMode', mode);
        },
        { family, mode },
      );
      await page.goto('/reset-password?error=access_denied&error_code=otp_expired');
      await expect(page.getByText('Dieser Link gilt nicht mehr', { exact: true })).toBeVisible();
      const palette = paletteOf(themeNameOf(family, mode === 'dark'));
      await semanticColor(
        page,
        page.getByRole('heading', { name: 'Dieser Link gilt nicht mehr' }),
        palette.ink,
      );
      const field = page.getByLabel('E-Mail', { exact: true });
      const submit = page.getByRole('button', { name: requestName, exact: true });
      await expect(submit).toBeDisabled();
      // The margin of the pages before the app (design Flows.jsx:257, #599).
      const heading = await page
        .getByRole('heading', { name: 'Dieser Link gilt nicht mehr' })
        .boundingBox();
      expect(heading).not.toBeNull();
      expect(heading!.x).toBe(20);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await wholeAboveAction(page, field);
        await shot(page, `reset-${family}-${mode}-invalid-${phone.width}`, { phones: [phone] });
      }
      await field.fill('falsch');
      await field.blur();
      const invalid = page.getByText(
        'Diese E-Mail-Adresse sieht nicht richtig aus. Schau sie dir bitte nochmal an.',
        { exact: true },
      );
      await expect(invalid).toBeVisible();
      await expect(submit).toBeDisabled();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await wholeAboveAction(page, invalid);
        await shot(page, `reset-${family}-${mode}-error-${phone.width}`, { phones: [phone] });
      }
      await field.fill(`missing-reset-${Date.now()}@example.test`);
      const primary = paletteOf(themeNameOf(family, mode === 'dark')).primary;
      await expect
        .poll(() =>
          submit.evaluate((element, expected) => {
            const swatch = document.createElement('span');
            swatch.style.color = expected;
            document.body.append(swatch);
            const color = getComputedStyle(swatch).color;
            swatch.remove();
            return [element, ...element.querySelectorAll('*')].some(
              (node) => getComputedStyle(node).backgroundColor === color,
            );
          }, primary),
        )
        .toBe(true);
      const response = page.waitForResponse(
        (response) =>
          response.url().includes('/auth/v1/recover') && response.request().method() === 'POST',
      );
      await submit.click();
      expect((await response).ok()).toBe(true);
      await expect(page.getByText(confirmation, { exact: true })).toBeVisible();
      await semanticColor(page, page.getByText(confirmation, { exact: true }), palette.ink2);
      await expect(submit).toBeDisabled();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await wholeAboveAction(page, page.getByText(confirmation, { exact: true }));
        await shot(page, `reset-${family}-${mode}-sent-${phone.width}`, { phones: [phone] });
      }
      await page.getByRole('button', { name: 'Zurück zur Anmeldung', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Konto erstellen', exact: true }),
      ).toBeVisible();
    });
  }
}

test('Reset real offline request preserves email and retries after connection returns', async ({
  page,
  context,
}) => {
  await page.goto('/reset-password');
  const field = page.getByLabel('E-Mail', { exact: true });
  const email = `retry-reset-${Date.now()}@example.test`;
  await field.fill(email);
  await context.setOffline(true);
  const submit = page.getByRole('button', { name: requestName, exact: true });
  try {
    await submit.click();
    const error = page.getByText('Keine Verbindung. Versuch es gleich nochmal.', { exact: true });
    await expect(error).toBeVisible();
    await expect(field).toHaveValue(email);
    await expect(submit).toBeEnabled();
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await wholeAboveAction(page, error);
      await shot(page, `reset-network-${phone.width}`, { phones: [phone] });
    }
  } finally {
    await context.setOffline(false);
  }
  await submit.click();
  await expect(page.getByText(confirmation, { exact: true })).toBeVisible();
  await expect(field).toHaveValue(email);
  await expect(submit).toBeDisabled();
});

test('Reset existing local account receives the same generic resend confirmation', async ({
  page,
  request,
}) => {
  const email = `known-reset-${Date.now()}@example.test`;
  const signup = await request.post(
    `http://localhost:${process.env.LB_API_PORT ?? '8787'}/auth/v1/signup`,
    {
      data: { email, password: 'geheim-1234' },
    },
  );
  expect(signup.ok()).toBe(true);
  // The account exists in the real local harness; do not install its returned session in the browser.
  await page.goto('/reset-password');
  await page.getByLabel('E-Mail', { exact: true }).fill(email);
  const response = page.waitForResponse(
    (response) =>
      response.url().includes('/auth/v1/recover') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: requestName, exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole('alert')).toHaveText(confirmation);
  // The toast's words are in the app's own face, not the system's (#599, owner rule 4).
  await expect(page.getByRole('alert').getByText(confirmation)).toHaveCSS('font-family', /Figtree/);
  await expect(page.getByRole('button', { name: requestName, exact: true })).toBeDisabled();
});
