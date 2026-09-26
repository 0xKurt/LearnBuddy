// "No scrolling" check for the walkthroughs (CLAUDE.md rule 16, docs/UX-PRINCIPLES.md):
// every screen is measured at real phone sizes and the walkthrough fails when
// anything has to be scrolled to be seen. Two kinds of areas may grow, because
// that is what they are: a conversation (testID "scroll-thread", newest at the
// bottom, always shown at its end) and a list she browses on purpose
// ("scroll-list": her material, her memories, a test's review) — the actions
// around them stay pinned. Screenshots are taken at the real size, so they show
// what Lena sees, not a stretched page.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Page } from '@playwright/test';

export const SHOTS = join(__dirname, '../../test-results/web/shots');
const REPORT = join(__dirname, '../../test-results/web/fit.jsonl');

export const PHONES = [
  { width: 390, height: 844 }, // iPhone 12–15
  { width: 360, height: 740 }, // small Android
] as const;

export type Overflow = { label: string; overflow: number; allowed: boolean };

/** Every scrolling box on the page that holds more than fits, by how much. */
export async function overflows(page: Page): Promise<Overflow[]> {
  return page.evaluate(() => {
    const out: { label: string; overflow: number; allowed: boolean }[] = [];
    const doc = document.scrollingElement ?? document.documentElement;
    if (doc.scrollHeight - doc.clientHeight > 2)
      out.push({ label: 'page', overflow: doc.scrollHeight - doc.clientHeight, allowed: false });
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const style = getComputedStyle(el);
      if (!['auto', 'scroll'].includes(style.overflowY)) continue;
      if (el.clientHeight === 0 || style.visibility === 'hidden') continue;
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow <= 2) continue;
      // Scroll areas are named by their testID (data-testid="scroll-…" on the web).
      const id = el.getAttribute('data-testid') ?? '';
      out.push({
        label: id || (el.innerText ?? '').replace(/\s+/g, ' ').slice(0, 40),
        overflow,
        allowed: id === 'scroll-thread' || id === 'scroll-list',
      });
    }
    return out;
  });
}

/**
 * Screenshot at every phone size and the overflow found there (into fit.jsonl);
 * fails on anything that must be scrolled. `opened`: a detail she opened on
 * purpose (a settings group) may push the closed ones below it off the screen.
 */
export async function shot(
  page: Page,
  name: string,
  { opened = false }: { opened?: boolean } = {},
): Promise<Overflow[]> {
  mkdirSync(SHOTS, { recursive: true });
  const size = page.viewportSize();
  const found: Overflow[] = [];
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await page.waitForTimeout(300);
    const here = await overflows(page);
    found.push(...here);
    appendFileSync(REPORT, `${JSON.stringify({ name, phone: phone.width, overflows: here })}\n`);
    await page.screenshot({
      path: join(SHOTS, phone.width === 390 ? `${name}.png` : `${name}-${phone.width}.png`),
    });
  }
  if (size) await page.setViewportSize(size);
  const tooLong = found.filter((o) => !o.allowed && !(opened && o.label !== 'page'));
  expect(tooLong, `${name}: must fit the screen without scrolling`).toEqual([]);
  return found;
}
