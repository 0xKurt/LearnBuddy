import { BuddySettingsView, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { SseReader } from '../../apps/mobile/lib/api/sse';
// Factual text was visually dim even where grouped accessibility text escaped axe.
import { expect, test } from '@playwright/test';
import buddy from '../../apps/mobile/locales/de/buddy.json';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import { PHONES } from './fit';
import { freshEmail, signUpMia } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

for (const look of SCREEN_LOOKS)
  test(`Chat factual receipt text: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    await signUpMia(page, freshEmail('chat-factual-text'));
    const key = await screenLook(page, look);
    await page.getByLabel('Schreib Buddy …').fill('Ich spiele Handball');
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(page.getByText('Cool – Handball merke ich mir.')).toBeVisible();
    await page.getByRole('button', { name: buddy.done.take_back, exact: true }).click();
    await page.getByRole('button', { name: /^Rückgängig:/ }).click();
    await expect(page.getByText(buddy.done.taken_back, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    const receipt = page.getByText('Gemerkt: Spielt Handball – rückgängig gemacht', {
      exact: true,
    });
    const rgb = (hex: string) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`;
    };
    const palette = paletteOf(themeNameOf(look.family, look.dark));
    const color = rgb(palette.ink2);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await expect(receipt).toBeVisible();
      // A receipt is the design's chip (components/core/Chip.jsx:12, `color: var(--ink)`, #599).
      await expect(receipt).toHaveCSS('color', rgb(palette.ink));
      await expect(receipt).toHaveCSS('font-family', /Figtree/);
    }
    await screenShots(page, `chat-${key}-readable-receipt`);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Benachrichtigungen', exact: true }).click();
    const changed = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname === '/v1/buddy/settings',
    );
    await page.getByRole('button', { name: 'Nicht mehr erlauben', exact: true }).click();
    expect(BuddySettingsView.parse(await (await changed).json()).contact_enabled).toBe(false);
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    const reminder = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/v1/buddy/messages',
    );
    await page.getByLabel('Schreib Buddy …').fill('Erinnere mich morgen um 16 Uhr an Brüche.');
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    const done = new SseReader()
      .push(await (await reminder).text())
      .find((event) => event.event === 'done');
    expect(done).toBeDefined();
    const returned = SendMessageResponse.parse(JSON.parse(done!.data));
    expect(returned.status).toBe('done');
    expect(returned.home.system.contact_enabled).toBe(false);
    expect(
      returned.home.thread
        .flatMap((message) => message.actions)
        .some((action) => action.summary.tool === 'plan_step' && action.summary.agreed),
    ).toBe(true);
    const explanation = page.getByText(buddy.done.in_app_only, { exact: true });
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await expect(explanation).toBeVisible();
      await expect(explanation).toHaveCSS('color', color);
      await expect(explanation).toHaveCSS('font-family', /Figtree/);
    }
    await screenShots(page, `chat-${key}-readable-explanation`);
  });
