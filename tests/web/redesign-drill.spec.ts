// Prepared against real dev-stack scenarios; execute only after ordered integration.
import { expect, test } from '@playwright/test';
import { openMenu } from './coreLoop';
import { onboardChild, startOffer } from './figureWalk';
import { shot } from './fit';
import {
  DrillAnswerRequest,
  SessionView,
  StartDrillRequest,
} from '../../packages/shared-types/src/contracts/index';
import practiceDE from '../../apps/mobile/locales/de/practice.json';
import { PALETTES } from '../../apps/mobile/lib/theme/palettes';

for (const family of ['pastell', 'ocean'] as const) {
  for (const dark of [false, true]) {
    test(`drill · ${family} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
      await onboardChild(page, 'drill');
      await openMenu(page, 'Einstellungen');
      await page.getByRole('button', { name: 'Aussehen', exact: true }).click();
      const familyChoice = page.getByRole('radio', {
        name: family === 'pastell' ? 'Pastell' : 'Meer',
        exact: true,
      });
      await familyChoice.click();
      await expect(familyChoice).toBeChecked();
      const mode = page.getByRole('radio', { name: dark ? 'Dunkel' : 'Hell', exact: true });
      await mode.click();
      await expect(mode).toBeChecked();
      await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      const key = dark ? `${family}Dark` : family;
      await startOffer(page, 'Lass uns Einmaleins üben', 'Einmaleins mit 6 und 7');
      const task = page.getByTestId('drill-task');
      await expect(task).toBeVisible();
      await expect(page).toHaveURL(/\/practice\/[0-9a-f-]{36}$/);
      await expect(page.getByText('Aufgabe 1 von 20', { exact: true })).toBeVisible();
      const numbers = /(\d+)\s*·\s*(\d+)/.exec(await task.innerText());
      expect(numbers).not.toBeNull();
      const answer = String(Number(numbers![1]) * Number(numbers![2]));
      const input = page.getByRole('textbox', { name: 'Deine Antwort', exact: true });
      await input.fill(answer);
      await expect(input).toHaveValue(answer);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const check = page.getByRole('button', { name: 'Prüfen', exact: true });
      await expect(input).toHaveCSS('font-family', /Figtree/);
      const palette = PALETTES[key as keyof typeof PALETTES];
      const ink = parseInt(palette.ink.slice(1), 16);
      await expect(input).toHaveCSS(
        'color',
        `rgb(${ink >> 16}, ${(ink >> 8) & 255}, ${ink & 255})`,
      );
      const frame = check.locator(':scope > div');
      await expect(frame).toHaveCount(1);
      const colour = parseInt(PALETTES[key as keyof typeof PALETTES].primary.slice(1), 16);
      await expect
        .poll(() => frame.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe(`rgb(${colour >> 16}, ${(colour >> 8) & 255}, ${colour & 255})`);
      await shot(page, `drill-${key}-numeric`);
      let finished: SessionView | null = null;
      const sessionId = new URL(page.url()).pathname.split('/').at(-1)!;
      const taskIds = new Set<string>();
      for (let n = 0; n < 20; n++) {
        const shown = await task.innerText();
        const factors = /(\d+)\s*·\s*(\d+)/.exec(shown);
        expect(factors).not.toBeNull();
        const correct = Number(factors![1]) * Number(factors![2]);
        const text = String(correct + (n === 1 ? 1 : 0));
        await input.fill(text);
        const posted = page.waitForResponse(
          (r) =>
            r.request().method() === 'POST' &&
            new URL(r.url()).pathname.endsWith(`/practice/sessions/${sessionId}/drill`),
        );
        await check.click();
        const response = await posted;
        expect(response.ok()).toBe(true);
        const payload = DrillAnswerRequest.parse(response.request().postDataJSON());
        expect(payload.text).toBe(text);
        expect(taskIds.has(payload.item_id)).toBe(false);
        taskIds.add(payload.item_id);
        const result = SessionView.parse(await response.json());
        expect(result.id).toBe(sessionId);
        expect(result.items.some((row) => row.item.id === payload.item_id)).toBe(true);
        if (n < 19) {
          expect(result.status).toBe('active');
          await expect(input).toHaveValue('');
          await expect(page.getByText(`Aufgabe ${n + 2} von 20`, { exact: true })).toBeVisible();
        } else finished = result;
      }
      expect(taskIds.size).toBe(20);
      expect(finished!.status).toBe('finished');
      expect(finished!.current_item_id).toBeNull();
      expect(finished!.drill?.summary).not.toBeNull();
      await expect(page.getByText('Geschafft!', { exact: true })).toBeVisible();
      await expect(page.getByText(practiceDE.summary.finished, { exact: true })).toBeVisible();
      await expect(page.locator('[data-testid="composer-primary"]:visible')).toHaveCount(0);
      await shot(page, `drill-${key}-completed`);
      const againResponse = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/practice/drills'),
      );
      await page.getByRole('button', { name: 'Noch eine Runde', exact: true }).click();
      const response = await againResponse;
      expect(response.ok()).toBe(true);
      const request = StartDrillRequest.parse(response.request().postDataJSON());
      expect(request.spec).toEqual(finished!.drill!.spec);
      const again = SessionView.parse(await response.json());
      expect(again.id).not.toBe(sessionId);
      expect(again.status).toBe('active');
      await expect(page.getByText('Aufgabe 1 von 20', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Übung beenden', exact: true }).click();
      await startOffer(page, 'Lass uns Brüche im Kopf addieren', 'Brüche addieren');
      const slash = page.getByRole('button', { name: 'Bruchstrich', exact: true });
      await expect(slash).toBeDisabled();
      await input.fill('3');
      await slash.click();
      await expect(input).toHaveValue('3/');
      await expect(slash).toBeDisabled();
      await input.fill('3/4');
      await shot(page, `drill-${key}-fraction`);
      await expect(input).toHaveValue('3/4');
      const fractionRequest = page.waitForRequest(
        (request) => request.method() === 'POST' && request.url().endsWith('/drill'),
      );
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
      expect((await fractionRequest).postDataJSON()).toMatchObject({ text: '3/4' });
      await expect(page.getByText('Aufgabe 2 von 20', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Übung beenden', exact: true }).click();
      await startOffer(page, 'Plus bis 100 im Kopf', 'Plus bis 100 ohne Übergang');
      await expect(
        page.getByRole('heading', { name: 'Plus bis 100 ohne Übergang', exact: true }),
      ).toBeVisible();
      await shot(page, `drill-${key}-long`);
      await page.getByRole('button', { name: 'Übung beenden', exact: true }).click();
      await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
    });
  }
}
