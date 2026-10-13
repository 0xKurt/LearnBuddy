import { expect, test } from '@playwright/test';
import { SessionView } from '../../packages/shared-types/src/contracts/index';
import { planTest, practise, sendWorksheet } from './coreLoop';
import { onboardChild } from './figureWalk';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import { PHONES } from './fit';
import practiceDE from '../../apps/mobile/locales/de/practice.json';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';

for (const look of SCREEN_LOOKS)
  test(`done ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await onboardChild(page, 'done');
    const key = await screenLook(page, look);
    await planTest(page);
    await sendWorksheet(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await practise(page);
    const resultPath = page.url();
    const id = new URL(resultPath).pathname.split('/').at(-1);
    expect(id).toBeTruthy();
    const loaded = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname.endsWith(`/practice/sessions/${id}`),
    );
    await page.reload();
    const session = SessionView.parse(await (await loaded).json());
    expect(session.status).toBe('finished');
    expect(session.mode).not.toBe('test');
    expect(session.items.length).toBeGreaterThan(0);
    await expect(
      page.getByRole('heading', { name: practiceDE.summary.title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(practiceDE.summary.finished, { exact: true })).toBeVisible();
    for (const item of session.items) expect(item.status).toBe('correct');
    // Each row ends in its state, in a word (design ui_kits/app/Done.jsx:36).
    const states = page
      .getByTestId('scroll-list')
      .getByText(practiceDE.summary_test.right, { exact: true });
    await expect(states).toHaveCount(session.items.length);
    const back = page
      .getByTestId('bottom-bar')
      .getByRole('button', { name: 'Zurück zu Buddy', exact: true });
    await expect(back).toBeVisible();
    await expect(page.locator('[data-testid="composer-primary"]:visible')).toHaveCount(0);
    const primary = paletteOf(themeNameOf(look.family, look.dark)).primary;
    const color = parseInt(primary.slice(1), 16);
    const frame = back.locator(':scope > div');
    await expect(frame).toHaveCount(1);
    await expect
      .poll(() => frame.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe(`rgb(${color >> 16}, ${(color >> 8) & 255}, ${color & 255})`);
    const list = page.getByTestId('scroll-list');
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      const overflow = await list.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      );
      if (overflow) {
        await list.focus();
        await expect(list).toBeFocused();
        await page.keyboard.press('PageDown');
        await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        await page.keyboard.press('End');
        const last = states.last();
        await expect
          .poll(async () => {
            const bounds = await last.boundingBox();
            const clip = await list.boundingBox();
            return (
              bounds !== null &&
              clip !== null &&
              bounds.y >= clip.y &&
              bounds.y + bounds.height <= clip.y + clip.height + 1
            );
          })
          .toBe(true);
        const bounds = await last.boundingBox();
        const clip = await list.boundingBox();
        expect(bounds).not.toBeNull();
        expect(clip).not.toBeNull();
        expect(bounds!.y).toBeGreaterThanOrEqual(clip!.y);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(clip!.y + clip!.height + 1);
        await list.evaluate((element) => {
          element.scrollTop = 0;
          (element as HTMLElement).blur();
        });
      }
    }
    await screenShots(page, `done-${key}-result`);
    const again = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/practice/topic'),
    );
    await page.getByRole('button', { name: practiceDE.again.harder, exact: true }).click();
    const response = await again;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).toMatchObject({
      kind: 'practice',
      from_session_id: session.id,
      difficulty: 'harder',
    });
    const next = SessionView.parse(await response.json());
    expect(next.id).not.toBe(session.id);
    await expect(page).toHaveURL(new RegExp(`/practice/${next.id}$`));
    await expect(page.getByTestId('question-card')).toBeVisible();
    await page.goto(resultPath);
    await expect(
      page.getByRole('heading', { name: practiceDE.summary.title, exact: true }),
    ).toBeVisible();
    await back.click();
    await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
  });
