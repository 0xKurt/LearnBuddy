import { expect, test } from '@playwright/test';
import errors from '../../apps/mobile/locales/de/errors.json';
import { freshEmail, signUpMia } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

for (const look of SCREEN_LOOKS)
  test(`History: ${look.family} ${look.dark ? 'dark' : 'light'} persisted messages and undo retry`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signUpMia(page, freshEmail('redesign-history'));
    const key = await screenLook(page, look);
    await page.getByLabel('Schreib Buddy …').fill('Ich spiele Handball');
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(page.getByText('Cool – Handball merke ich mir.')).toBeVisible();
    await page.goto('/history');
    await expect(page).toHaveURL(/\/history$/);
    // ui_kits/app/More.jsx:51: the page is "Verlauf", and under it when she last wrote.
    await expect(page.getByRole('heading', { name: 'Verlauf', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chat mit Buddy', exact: true })).toHaveCount(0);
    await expect(page.getByText(/^Heute, \d{2}:\d{2}$/)).toBeVisible();
    await expect(page.getByText('Ich spiele Handball', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Senden', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Schreib Buddy …')).toHaveCount(0);
    await screenShots(page, `history-${key}-messages`);
    await page.reload();
    await expect(page.getByText('Ich spiele Handball', { exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Zurücknehmen', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Was du zurücknehmen kannst', exact: true }),
    ).toBeVisible();
    const undo = page.getByRole('button', { name: /^Rückgängig: / });
    await expect(undo).toHaveCount(1);
    let attempts = 0;
    await page.route('**/v1/buddy/actions/*/undo', async (route) => {
      attempts++;
      if (attempts === 1) await route.abort('failed');
      else await route.continue();
    });
    await undo.click();
    await expect(page.getByText(errors.code.network, { exact: true })).toBeVisible();
    await expect(undo).not.toHaveAttribute('aria-disabled', 'true');
    await screenShots(page, `history-${key}-undo-error`);
    const response = page.waitForResponse(
      (r) =>
        /\/v1\/buddy\/actions\/[^/]+\/undo$/.test(new URL(r.url()).pathname) &&
        r.request().method() === 'POST',
    );
    await undo.click();
    expect((await response).status()).toBe(200);
    expect(attempts).toBe(2);
    await expect(page.getByText('Zurückgenommen', { exact: true })).toBeVisible();
    await expect(undo).toHaveCount(0);
    await expect(page.getByText(errors.code.network, { exact: true })).toHaveCount(0);
    await screenShots(page, `history-${key}-undone`);
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(page.getByText('Gemerkt: Spielt Handball – rückgängig gemacht')).toBeVisible();
    await page.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'LearnBuddy', exact: true })).toBeVisible();
  });
