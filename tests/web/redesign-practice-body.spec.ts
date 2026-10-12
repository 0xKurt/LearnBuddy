// Actual existing offers, PG sessions and grading. No assigned phase or modified response.
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import {
  AnswerRequest,
  AnswerResponse,
  ReexplainRequest,
  WhyRequest,
} from '../../packages/shared-types/src/contracts/index';
import { onboardChild, startOffer } from './figureWalk';
import { PHONES, shot } from './fit';
import { SCREEN_LOOKS, screenLook, screenTargets } from './redesign-screen-matrix';

async function whole(control: Locator): Promise<boolean> {
  return control.evaluate((el) => {
    const body = el.closest('[data-testid="scroll-practice-body"]');
    if (!body) throw new Error('Control is not in the ordinary body');
    const b = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const ring = Number.parseFloat(getComputedStyle(el).outlineWidth) || 0;
    return (
      r.top - ring >= b.top - 1 &&
      r.bottom + ring <= b.bottom + 1 &&
      r.left - ring >= b.left - 1 &&
      r.right + ring <= b.right + 1
    );
  });
}
async function reach(page: Page, name: string): Promise<void> {
  const option = page.getByRole('radio', { name, exact: true });
  await option.focus();
  await option.scrollIntoViewIfNeeded();
  // Browser focus scrolling includes the border, not its outside focus ring.
  // Use a real wheel gesture within the body to reveal the entire focused frame.
  if (!(await whole(option))) {
    const movement = await option.evaluate((el) => {
      const body = el.closest('[data-testid="scroll-practice-body"]')!;
      const b = body.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const ring = Number.parseFloat(getComputedStyle(el).outlineWidth) || 0;
      return {
        x: b.left + b.width / 2,
        y: b.top + b.height / 2,
        delta: r.bottom + ring > b.bottom ? r.bottom + ring - b.bottom : r.top - ring - b.top,
      };
    });
    await page.mouse.move(movement.x, movement.y);
    await page.mouse.wheel(0, movement.delta);
  }
  await expect.poll(() => whole(option)).toBe(true);
}
async function capture(page: Page, name: string): Promise<void> {
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await screenTargets(page);
    await shot(page, `${name}-${phone.width}`, { phones: [phone] });
  }
}
async function home(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Übung beenden', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'LearnBuddy', exact: true })).toBeVisible();
}
async function check(page: Page, name: string) {
  const count: unknown[] = [];
  const listener = (request: Request) => {
    if (request.method() === 'POST' && /\/answer$/.test(request.url()))
      count.push(request.postDataJSON());
  };
  page.on('request', listener);
  try {
    await reach(page, name);
    await page.getByRole('radio', { name, exact: true }).click();
    expect(count).toEqual([]);
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && /\/practice\/sessions\/[^/]+\/answer$/.test(r.url()),
    );
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    const result = await response;
    expect(result.ok()).toBe(true);
    const body = AnswerResponse.parse(await result.json());
    const payload = AnswerRequest.parse(result.request().postDataJSON());
    const item = body.session.items.find((value) => value.item.id === payload.item_id);
    expect(item?.item.choices?.[payload.choice!]).toBe(name);
    expect(count).toHaveLength(1);
    return body;
  } finally {
    page.off('request', listener);
  }
}

for (const look of SCREEN_LOOKS) {
  test(`ordinary scrolling body and pinned real help: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    test.setTimeout(360_000);
    page.on('pageerror', (error) => console.log('ordinary body browser error', error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') console.log('ordinary body console error', message.text());
    });
    await onboardChild(page, 'practice-body');
    const key = await screenLook(page, look);
    await startOffer(page, 'Lass uns Malnehmen üben', 'Aufgaben zum Malnehmen');
    const body = page.locator('[data-testid="scroll-practice-body"]:visible');
    await expect(body).toBeVisible();
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      for (const name of ['3 + 4', '3 · 4', '4 − 3', '4 + 4']) await reach(page, name);
    }
    await check(page, '3 + 4');
    await check(page, '4 − 3');
    await check(page, '4 + 4');
    const why = page.getByRole('button', { name: 'Warum stimmt das?', exact: true });
    await expect(why).toBeVisible();
    expect(await why.evaluate((el) => Boolean(el.closest('[data-testid="bottom-bar"]')))).toBe(
      true,
    );
    // Genuine manual reading first: the pinned shortcut must reveal its body without click auto-scroll.
    await body.focus();
    await page.keyboard.press('Home');
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
    await why.click();
    const reasons = [
      'Weil man die beiden Zahlen einfach zusammenzählt.',
      'Weil gleich große Reihen ein Vielfaches derselben Anzahl sind.',
      'Weil die kleinere Zahl immer vorne steht.',
    ];
    await expect
      .poll(() => whole(page.getByRole('radio', { name: reasons[0], exact: true })))
      .toBe(true);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      for (const reason of reasons) await reach(page, reason);
    }
    await capture(page, `body-${key}-reason-choices`);
    const submitted: unknown[] = [];
    const listen = (r: Request) => {
      if (r.method() === 'POST' && /\/why$/.test(r.url())) submitted.push(r.postDataJSON());
    };
    page.on('request', listen);
    let releaseWhy!: () => void;
    const heldWhy = new Promise<void>((resolve) => {
      releaseWhy = resolve;
    });
    await page.route(/\/why$/, async (route) => {
      await heldWhy;
      await route.continue();
    });
    try {
      await reach(page, reasons[1]);
      await page.getByRole('radio', { name: reasons[1], exact: true }).click();
      expect(submitted).toEqual([]);
      const reply = page.waitForResponse(
        (r) => /\/why$/.test(r.url()) && r.request().method() === 'POST',
      );
      const primary = page.getByRole('button', { name: 'Prüfen', exact: true });
      const box = await primary.boundingBox();
      if (!box) throw new Error('Missing real primary');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(primary).toBeDisabled();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      releaseWhy();
      const response = await reply;
      expect(response.ok()).toBe(true);
      expect(WhyRequest.parse(response.request().postDataJSON()).choice).toBe(1);
      expect(submitted).toHaveLength(1);
      await expect(page.getByText(`Genau – ${reasons[1]}`, { exact: true })).toBeVisible();
    } finally {
      releaseWhy();
      await page.unroute(/\/why$/);
      page.off('request', listen);
    }
    await capture(page, `body-${key}-reason-answered`);
    await home(page);
    await startOffer(page, 'Ich will den Streckfaktor üben', 'mit Bild');
    await check(page, 'Er wird breiter.');
    await check(page, 'Er wird schmaler.');
    await page.setViewportSize({ width: 360, height: 440 });
    await page.getByRole('textbox', { name: 'Deine Frage zur Aufgabe', exact: true }).focus();
    await body.focus();
    await page.keyboard.press('Home');
    const example = page.getByRole('button', { name: 'Mit Beispiel', exact: true });
    const explain = page.waitForResponse(
      (r) => /\/reexplain$/.test(r.url()) && r.request().method() === 'POST',
    );
    await example.click();
    const response = await explain;
    expect(response.ok()).toBe(true);
    expect(ReexplainRequest.parse(response.request().postDataJSON()).way).toBe('example');
    const result = AnswerResponse.parse(await response.json());
    expect(result.reply.figure).toBeDefined();
    expect(result.reply.figure).not.toBeNull();
    const turn = page.getByTestId('thread-turn').filter({ hasText: 'Je größer a' });
    await expect(turn).toHaveCount(1);
    // Observe initial text before any scrollIntoView: end-only following would hide this start.
    await expect
      .poll(() =>
        turn.evaluate((el) => {
          const clip = el.closest('[data-testid="scroll-practice-body"]')!.getBoundingClientRect();
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            if (!(walker.currentNode.textContent ?? '').trim().startsWith('Je')) continue;
            const range = document.createRange();
            const start = (walker.currentNode.textContent ?? '').indexOf('Je');
            range.setStart(walker.currentNode, start);
            range.setEnd(walker.currentNode, start + 2);
            const r = range.getBoundingClientRect();
            return r.top >= clip.top - 1 && r.bottom <= clip.bottom + 1;
          }
          return false;
        }),
      )
      .toBe(true);
    await body.focus();
    await page.keyboard.press('End');
    await expect
      .poll(() => body.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
      .toBeLessThanOrEqual(1);
    await capture(page, `body-${key}-read-through`);
    await page.setViewportSize(PHONES[0]);
    await home(page);
    await startOffer(page, 'Erklär mir den Dativ', 'gleich üben');
    await check(page, 'Wem?');
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Deine Antwort', exact: true })).toBeVisible();
    await capture(page, `body-${key}-typed-open`);
    await page.getByRole('textbox', { name: 'Deine Antwort', exact: true }).fill('der');
    const typed = page.waitForResponse(
      (r) => /\/answer$/.test(r.url()) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    const typedResult = await typed;
    expect(typedResult.ok()).toBe(true);
    expect(AnswerRequest.parse(typedResult.request().postDataJSON()).text).toBe('der');
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeVisible();
    await capture(page, `body-${key}-typed-closed`);
  });
}
