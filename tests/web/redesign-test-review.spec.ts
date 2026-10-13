import { expect, test } from '@playwright/test';
import { AnswerRequest, SessionView } from '../../packages/shared-types/src/contracts/index';
import { onboardChild, startOffer } from './figureWalk';
import { PHONES } from './fit';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import practiceDE from '../../apps/mobile/locales/de/practice.json';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';

for (const look of SCREEN_LOOKS)
  test(`test-review ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await onboardChild(page, 'test-review');
    const key = await screenLook(page, look);
    await startOffer(page, 'Mach einen Probetest zum Malnehmen', 'Probetest zum Malnehmen');
    await expect(page).toHaveURL(/\/practice\/[0-9a-f-]{36}$/);
    const id = new URL(page.url()).pathname.split('/').at(-1);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const sessionPath = `/practice/sessions/${id}`;
    const loaded = page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith(sessionPath),
    );
    await page.reload();
    const active = SessionView.parse(await (await loaded).json());
    expect(active.mode).toBe('test');
    expect(active.status).toBe('active');
    expect(active.items).toHaveLength(3);
    for (const [index, answer] of ['3 + 4', '12'].entries()) {
      await page.getByRole('radio', { name: answer, exact: true }).click();
      const checked = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.endsWith(`${sessionPath}/answer`),
      );
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
      const response = await checked;
      expect(response.ok()).toBe(true);
      const payload = AnswerRequest.parse(response.request().postDataJSON());
      expect(payload.item_id).toBe(active.items[index].item.id);
      const choices = active.items[index].item.choices;
      expect(choices).not.toBeNull();
      expect(payload.choice).toBe(choices!.indexOf(answer));
      expect(choices![payload.choice!]).toBe(answer);
      expect(payload.text).toBeUndefined();
      expect(payload.via).toBeUndefined();
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
    const skipped = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname.endsWith(`${sessionPath}/reveal`),
    );
    await page.getByRole('button', { name: 'Überspringen', exact: true }).click();
    const skipResponse = await skipped;
    expect(skipResponse.ok()).toBe(true);
    expect(skipResponse.request().postDataJSON()).toEqual({ item_id: active.items[2].item.id });
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    const finished = page.waitForResponse(
      (r) => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith(sessionPath),
    );
    await page.reload();
    const session = SessionView.parse(await (await finished).json());
    expect(session.status).toBe('finished');
    expect(session.mode).toBe('test');
    expect(session.timer?.ran_out).not.toBe(true);
    expect(session.items.map((row) => row.item.id)).toEqual(active.items.map((row) => row.item.id));
    expect(session.items.map((row) => row.status)).toEqual(['missed', 'correct', 'skipped']);
    await expect(
      page.getByRole('heading', { name: 'Probetest geschafft!', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: session.title, exact: true })).toBeVisible();
    await expect(page.getByText(practiceDE.summary.finished, { exact: true })).toBeVisible();
    const statuses = [
      practiceDE.summary_test.missed,
      practiceDE.summary_test.right,
      practiceDE.summary_test.skipped,
    ];
    // Each row ends in its state, in a word (design ui_kits/app/Done.jsx:36).
    for (const status of statuses)
      await expect(page.getByTestId('scroll-list').getByText(status, { exact: true })).toHaveCount(
        1,
      );
    for (const row of session.items) {
      await expect(page.getByTestId('scroll-list')).toContainText(row.item.prompt);
      if (row.status !== 'correct' && row.answer !== null) {
        await expect(page.getByTestId('scroll-list')).toContainText(
          practiceDE.summary_test.solution.replace('{{answer}}', row.answer),
        );
      }
    }
    const back = page
      .getByTestId('bottom-bar')
      .getByRole('button', { name: 'Zurück zu Buddy', exact: true });
    await expect(page.locator('[data-testid="composer-primary"]:visible')).toHaveCount(0);
    const primary = paletteOf(themeNameOf(look.family, look.dark)).primary;
    const rgb = parseInt(primary.slice(1), 16);
    await expect
      .poll(() =>
        back.locator(':scope > div').evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .toBe(`rgb(${rgb >> 16}, ${(rgb >> 8) & 255}, ${rgb & 255})`);
    const list = page.getByTestId('scroll-list');
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      if (await list.evaluate((el) => el.scrollHeight > el.clientHeight)) {
        await list.focus();
        await expect(list).toBeFocused();
        await page.keyboard.press('PageDown');
        await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        await page.keyboard.press('End');
      }
      const last = list.getByText(practiceDE.summary_test.skipped, { exact: true });
      await expect(last).toBeInViewport({ ratio: 1 });
      const finalRow = session.items.at(-1)!;
      expect(finalRow.answer).not.toBeNull();
      const lastTexts = [
        practiceDE.summary_test.solution.replace('{{answer}}', finalRow.answer!),
        ...(finalRow.explanation ? [finalRow.explanation] : []),
      ];
      for (const text of lastTexts) {
        const content = list.getByText(text, { exact: true });
        await expect(content).toBeInViewport({ ratio: 1 });
        const bounds = await content.boundingBox();
        const clip = await list.boundingBox();
        expect(bounds).not.toBeNull();
        expect(clip).not.toBeNull();
        expect(bounds!.y).toBeGreaterThanOrEqual(clip!.y);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(clip!.y + clip!.height + 1);
      }
      await list.evaluate((el) => {
        el.scrollTop = 0;
        (el as HTMLElement).blur();
      });
    }
    await screenShots(page, `test-review-${key}-result`);
    await back.click();
    await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
  });
