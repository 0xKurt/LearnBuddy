// Real local session and sandbox grading at the existing maximum code-line contract.
import { expect, test } from '@playwright/test';

import { onboardChild, startOffer } from './figureWalk';
import { PHONES, shot } from './fit';
import { openMenu } from './coreLoop';
import { PALETTES } from '../../apps/mobile/lib/theme/palettes';

for (const family of ['pastell', 'ocean'] as const) {
  for (const dark of [false, true]) {
    test(`eight code lines · ${family} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
      await onboardChild(page, 'eight-code');
      await openMenu(page, 'Einstellungen');
      await page.getByRole('button', { name: 'Aussehen', exact: true }).click();
      await page
        .getByRole('radio', { name: family === 'pastell' ? 'Pastell' : 'Meer', exact: true })
        .click();
      const mode = page.getByRole('radio', { name: dark ? 'Dunkel' : 'Hell', exact: true });
      await mode.click();
      await expect(mode).toBeChecked();
      await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      await startOffer(page, 'Lass uns acht Codezeilen üben', 'acht Codezeilen');
      const rows = page.getByRole('radio', { name: /^Zeile \d/ });
      await expect(rows).toHaveCount(8);
      const submitted: unknown[] = [];
      page.on('request', (request) => {
        if (
          request.method() === 'POST' &&
          /\/practice\/sessions\/[^/]+\/answer$/.test(request.url())
        ) {
          submitted.push(request.postDataJSON());
        }
      });
      await rows.nth(7).click();
      await expect(rows.nth(7)).toBeChecked();
      await expect(page.getByRole('button', { name: 'Prüfen', exact: true })).toBeEnabled();
      expect(submitted).toEqual([]);
      // useDraft writes to disk after its existing debounce; a reload is a process restart.
      await expect
        .poll(() =>
          page.evaluate(() =>
            Object.keys(localStorage).some(
              (key) =>
                key.startsWith('lb.draft.') &&
                key.endsWith('.codeLine') &&
                localStorage.getItem(key) === '7',
            ),
          ),
        )
        .toBe(true);
      await page.reload();
      await expect(rows).toHaveCount(8);
      await expect(rows.nth(7)).toBeChecked();
      await expect(page.getByRole('button', { name: 'Prüfen', exact: true })).toBeEnabled();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        const geometry = await rows.evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            return {
              width: box.width,
              height: box.height,
              top: box.top,
              bottom: box.bottom,
              viewport: innerHeight,
              clipped: element.scrollWidth > element.clientWidth + 1,
            };
          }),
        );
        for (const row of geometry) {
          expect(row.width).toBeGreaterThanOrEqual(44);
          expect(row.height).toBeGreaterThanOrEqual(44);
          expect(row.top).toBeGreaterThanOrEqual(0);
          expect(row.bottom).toBeLessThanOrEqual(row.viewport);
          expect(row.clipped).toBe(false);
        }
      }
      const key = dark ? `${family}Dark` : family;
      const expected = PALETTES[key as keyof typeof PALETTES].primary;
      const n = parseInt(expected.slice(1), 16);
      // Btn paints its immediate inner frame; its semantic Pressable is transparent.
      await expect
        .poll(() =>
          page
            .getByRole('button', { name: 'Prüfen', exact: true })
            .evaluate((button) => getComputedStyle(button.firstElementChild!).backgroundColor),
        )
        .toBe(`rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`);
      await page.setViewportSize({ width: 360, height: 740 });

      await shot(page, `practice-eight-code-${key}-selected`);
      expect(submitted).toEqual([]);
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
      await expect(page.getByText('Stimmt – gut gemacht!').last()).toBeVisible();
      expect(submitted).toHaveLength(1);
      expect(submitted[0]).toMatchObject({ text: '8' });
      await shot(page, `practice-eight-code-${key}-correct`);
      await page.getByRole('button', { name: 'Übung beenden', exact: true }).click();
      await startOffer(page, 'Lass uns Malnehmen üben', 'Aufgaben zum Malnehmen');
      const wrong = page.getByRole('radio', { name: '3 + 4', exact: true });
      const right = page.getByRole('radio', { name: '3 · 4', exact: true });
      await expect(wrong).toBeVisible();
      await shot(page, `practice-options-${key}-idle`);
      await wrong.click();
      await expect(wrong).toBeChecked();
      await shot(page, `practice-options-${key}-selected`);
      await page.getByRole('button', { name: 'Mit Buddy sprechen', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Antwort sagen', exact: true })).toBeVisible();
      await shot(page, `practice-options-${key}-voice-check`);
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
      await expect(page.getByText('Noch nicht ganz – probier', { exact: false })).toBeVisible();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        const tried = page.getByText('Schon ausprobiert', { exact: true });
        await expect(tried).toBeVisible();
        expect(await tried.evaluate((text) => text.scrollWidth <= text.clientWidth + 1)).toBe(true);
        expect(await tried.evaluate((text) => getComputedStyle(text).textOverflow)).not.toBe(
          'ellipsis',
        );
      }
      await shot(page, `practice-options-${key}-wrong`);
      await right.click();
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
      await expect(page.getByText('Stimmt – gut gemacht!', { exact: true }).last()).toBeVisible();
      await shot(page, `practice-options-${key}-correct`);
    });
  }
}
