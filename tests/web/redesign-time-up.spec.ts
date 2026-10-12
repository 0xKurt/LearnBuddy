import { expect, test } from '@playwright/test';
import { AnswerRequest, SessionView } from '../../packages/shared-types/src/contracts/index';
import { onboardChild, startOffer } from './figureWalk';
import { PHONES, shot } from './fit';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import practiceDE from '../../apps/mobile/locales/de/practice.json';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';

for (const look of SCREEN_LOOKS)
  test(`time-up · ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(180_000);
    await onboardChild(page, 'time-up');
    const key = await screenLook(page, look);
    await startOffer(
      page,
      'Mach einen Probetest zur Photosynthese mit Zeit, wie in der Arbeit',
      'Photosynthese',
    );
    await expect(page).toHaveURL(/\/practice\/[0-9a-f-]{36}$/);
    const id = new URL(page.url()).pathname.split('/').at(-1)!;
    const sessionPath = `/v1/practice/sessions/${id}`;
    const loaded = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === sessionPath &&
        r.request().method() === 'GET' &&
        r.status() === 200,
    );
    await page.reload();
    const initial = SessionView.parse(await (await loaded).json());
    expect(initial.mode).toBe('test');
    expect(initial.status).toBe('active');
    expect(initial.timer).not.toBeNull();
    expect(initial.items).toHaveLength(3);
    for (const [index, answer] of ['Kohlenstoffdioxid', 'In den Chloroplasten'].entries()) {
      await page.getByRole('radio', { name: answer, exact: true }).click();
      const checked = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === `${sessionPath}/answer` && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
      const response = await checked;
      expect(response.ok()).toBe(true);
      const payload = AnswerRequest.parse(response.request().postDataJSON());
      expect(payload.item_id).toBe(initial.items[index].item.id);
      expect(payload.choice).toBe(initial.items[index].item.choices!.indexOf(answer));
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
    const beforeDeadline = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === sessionPath &&
        r.request().method() === 'GET' &&
        r.status() === 200,
    );
    await page.reload();
    const active = SessionView.parse(await (await beforeDeadline).json());
    expect(active.status).toBe('active');
    expect(active.timer).not.toBeNull();
    expect(active.items[2].status).toBe('open');
    expect(active.items.map((row) => row.item.id)).toEqual(initial.items.map((row) => row.item.id));
    const moved = await page.request.post(
      `http://localhost:${process.env.LB_API_PORT ?? '8787'}/__dev/practice/${id}/deadline`,
      { data: { in_ms: 4_000 } },
    );
    expect(moved.status()).toBe(204);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Die Zeit ist um', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const finishedResponse = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === sessionPath &&
        r.request().method() === 'GET' &&
        r.status() === 200,
    );
    await page.reload();
    const finished = SessionView.parse(await (await finishedResponse).json());
    expect(finished.status).toBe('finished');
    expect(finished.mode).toBe('test');
    expect(finished.timer?.ran_out).toBe(true);
    expect(finished.items.map((row) => row.item.id)).toEqual(
      initial.items.map((row) => row.item.id),
    );
    expect(finished.items.map((row) => row.status)).toEqual(['correct', 'correct', 'open']);
    await expect(page.getByRole('heading', { name: finished.title, exact: true })).toBeVisible();
    await expect(page.getByText(practiceDE.summary.finished, { exact: true })).toBeVisible();
    await expect(page.getByText('In der Zeit hast du 2 von 3 Fragen beantwortet.')).toBeVisible();
    await expect(page.getByText('Was offen blieb, zählt nicht als falsch.')).toBeVisible();
    await expect(page.getByText('3 · Nicht beantwortet', { exact: true })).toHaveCount(1);
    const last = finished.items[2];
    expect(last.answer).toBe('Traubenzucker');
    const solutionText = practiceDE.summary_test.solution.replace('{{answer}}', last.answer!);
    const list = page.getByTestId('scroll-list');
    for (const row of finished.items) await expect(list).toContainText(row.item.prompt);
    await expect(list).toContainText(solutionText);
    const back = page
      .getByTestId('bottom-bar')
      .getByRole('button', { name: 'Zurück zu Buddy', exact: true });
    await expect(page.locator('[data-testid="composer-primary"]:visible')).toHaveCount(0);
    const color = Number.parseInt(
      paletteOf(themeNameOf(look.family, look.dark)).primary.slice(1),
      16,
    );
    const css = `rgb(${color >> 16}, ${(color >> 8) & 255}, ${color & 255})`;
    await expect
      .poll(() =>
        back.evaluate(
          (button, expected) =>
            [button, ...button.querySelectorAll('*')].some(
              (el) => getComputedStyle(el).backgroundColor === expected,
            ),
          css,
        ),
      )
      .toBe(true);
    await screenShots(page, `time-up-${key}-result`);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      if (await list.evaluate((el) => el.scrollHeight > el.clientHeight)) {
        await list.focus();
        await expect(list).toBeFocused();
        await page.keyboard.press('PageDown');
        await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        await page.keyboard.press('End');
      }
      const finalTexts = [solutionText, ...(last.explanation ? [last.explanation] : [])];
      for (const text of finalTexts) {
        const content = list.getByText(text, { exact: true });
        await expect(content).toBeInViewport({ ratio: 1 });
        const bounds = await content.boundingBox();
        const clip = await list.boundingBox();
        expect(bounds!.y).toBeGreaterThanOrEqual(clip!.y);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(clip!.y + clip!.height + 1);
      }
      await expect(back).toBeInViewport({ ratio: 1 });
      await shot(page, `time-up-${key}-review-end-${phone.width}`, { phones: [phone] });
      await list.evaluate((el) => {
        el.scrollTop = 0;
        (el as HTMLElement).blur();
      });
    }
    await back.click();
    await expect(page.getByLabel('Schreib Buddy …')).toBeVisible();
  });
