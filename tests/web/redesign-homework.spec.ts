// Homework uses the shared Practice runtime delivered by #552 (#548).
import { AnswerResponse } from '@learnbuddy/shared-types/contracts';
import { expect, test } from '@playwright/test';

import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import { freshEmail, openMenu, signUpMia } from './coreLoop';
import { PHONES, shot } from './fit';

for (const family of ['Pastell', 'Meer'] as const) {
  for (const dark of [false, true]) {
    test(`homework: ${family} ${dark ? 'dark' : 'light'} hints and own answer`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
      await signUpMia(page, freshEmail('homework'));
      await openMenu(page, 'Einstellungen');
      const familyChoice = page.getByRole('radio', { name: family, exact: true });
      await familyChoice.click();
      await expect(familyChoice).toBeChecked();
      const mode = page.getByRole('radio', { name: dark ? 'Dunkel' : 'Hell', exact: true });
      await mode.click();
      await expect(mode).toBeChecked();
      await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      await openMenu(page, 'Hausaufgabe');
      await page.getByRole('button', { name: 'Aufgabe eintippen' }).click();
      await page
        .locator('[aria-modal="true"]')
        .getByRole('textbox', { name: 'Welche Aufgabe? Schreib sie ab.', exact: true })
        .fill('Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt.');
      await page
        .locator('[aria-modal="true"]')
        .getByRole('button', { name: 'Los geht’s' })
        .or(page.locator('[aria-modal="true"]').getByRole('button', { name: "Los geht's" }))
        .click();
      await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/);
      await expect(
        page.getByText('Hausaufgabe – ich gebe dir Tipps, die Lösung findest du selbst.'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Lösung zeigen' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Später' })).toHaveCount(0);
      await expect(page.getByTestId('buddy-header-footer')).toHaveCount(1);
      const answer = page.getByLabel('Deine Antwort');
      await answer.fill('keine Ahnung');
      const check = page.getByRole('button', { name: 'Prüfen', exact: true });
      const frame = check.locator(':scope > div');
      await expect(frame).toHaveCount(1);
      const palette = paletteOf(themeNameOf(family === 'Pastell' ? 'pastell' : 'ocean', dark));
      const rgb = parseInt(palette.primary.slice(1), 16);
      await expect(frame).toHaveCSS(
        'background-color',
        `rgb(${rgb >> 16}, ${(rgb >> 8) & 255}, ${rgb & 255})`,
      );
      await answer.blur();
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await expect
        .poll(
          () =>
            check.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return element.contains(
                document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
              );
            }),
          'the settled held point hits the actual Check target',
        )
        .toBe(true);
      const box = await check.boundingBox();
      if (!box) throw new Error('Homework Check has no visible target');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const scale = () => frame.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
      await expect.poll(scale).toBeLessThan(1);
      // Toggle while this real mounted action is held; reduction must settle its press now.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect.poll(scale).toBe(1);
      await page.mouse.up();
      await expect(page.getByText('Welche zwei Längen kennst du vom Rechteck?')).toBeVisible();
      const expectedInk = await page.evaluate((color) => {
        const element = document.createElement('span');
        element.style.color = color;
        document.body.append(element);
        const normalized = getComputedStyle(element).color;
        element.remove();
        return normalized;
      }, palette.ink);
      await expect(answer).toHaveCSS('color', expectedInk);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await answer.fill('3/4');
        await expect(page.getByLabel('Vorschau deiner Antwort: 3 Viertel')).toBeVisible();
        // The help chips stand directly above the Composer while the question is open, typed
        // text or not (design ui_kits/app/Flows.jsx:56: `['Tipp', 'Rechenweg zeigen']`).
        await expect(page.getByTestId('bottom-bar').getByText('Tipp', { exact: true })).toHaveCount(
          1,
        );
        await shot(
          page,
          `homework-${family.toLowerCase()}-${dark ? 'dark' : 'light'}-${phone.width}`,
        );
      }
      const finishedResponse = page.waitForResponse(
        (response) =>
          /\/practice\/sessions\/[^/]+\/answer$/.test(new URL(response.url()).pathname) &&
          response.request().method() === 'POST',
      );
      await answer.fill('7·4\n28');
      await page.getByRole('button', { name: 'Prüfen' }).click();
      await expect(page.getByText('Selbst gelöst!', { exact: true })).toBeVisible();
      const response = await finishedResponse;
      expect(response.ok()).toBe(true);
      const finished = AnswerResponse.parse(await response.json()).session;
      expect(finished.mode).toBe('help');
      expect(finished.status).toBe('finished');
      expect(finished.summary).not.toBeNull();
      expect(finished.current_item_id).toBeNull();
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
      await expect(page.getByText('Hausaufgabe geschafft', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Deine Antwort', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Prüfen', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Noch eine Runde', exact: true })).toHaveCount(
        0,
      );
      const back = page.getByTestId('bottom-bar').getByRole('button', {
        name: 'Zurück zu Buddy',
        exact: true,
      });
      await expect(back).toBeVisible();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await shot(
          page,
          `homework-finished-${family.toLowerCase()}-${dark ? 'dark' : 'light'}-${phone.width}`,
        );
      }
      await back.click();
      await expect(page).toHaveURL(/\/buddy$/);
      await expect(
        page.getByRole('textbox', { name: 'Schreib Buddy …', exact: true }),
      ).toBeVisible();
    });
  }
}
