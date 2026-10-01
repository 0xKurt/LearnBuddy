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

import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const SHOTS = join(__dirname, '../../test-results/web/shots');
const REPORT = join(__dirname, '../../test-results/web/fit.jsonl');
const A11Y = join(__dirname, '../../test-results/web/a11y.jsonl');

/**
 * Roles, names and colours as a machine sees them (issue #73): axe runs at every stop the
 * walkthrough takes a picture of. Rules that do not apply to a React-Native-web app are off:
 * the page is one view without landmarks or a document heading, and the viewport is a phone.
 */
const AXE_OFF = [
  'region',
  'landmark-one-main',
  'page-has-heading-one',
  'html-has-lang',
  'document-title',
  'meta-viewport',
];

/** Serious and critical findings at this stop; everything is written to a11y.jsonl. */
export async function a11y(page: Page, name: string): Promise<string[]> {
  const res = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(AXE_OFF)
    .analyze();
  const found = res.violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? 'minor',
    nodes: v.nodes.length,
    help: v.help,
    where: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
  mkdirSync(SHOTS, { recursive: true });
  appendFileSync(A11Y, `${JSON.stringify({ name, found })}\n`);
  return found
    .filter((f) => f.impact === 'serious' || f.impact === 'critical')
    .map((f) => `${f.id} (${f.nodes}×): ${f.help}`);
}

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
    if (doc.scrollHeight - doc.clientHeight > 2) {
      // Name what sticks out, not just that something does. "page overflow: 4" sent me
      // hunting through a screen's whole layout once (issue #170 session); the element
      // that reaches furthest past the fold is the answer in one line.
      let worst = { what: '', past: 0 };
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const box = el.getBoundingClientRect();
        if (box.height === 0 || box.width === 0) continue;
        const past = Math.round(box.bottom - doc.clientHeight);
        if (past <= worst.past) continue;
        const id = el.getAttribute('data-testid');
        worst = {
          what:
            id ??
            `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(' ')[0]}` : ''} "${(el.innerText ?? '').replace(/\s+/g, ' ').slice(0, 30)}"`,
          past,
        };
      }
      out.push({
        label: worst.what ? `page (lowest: ${worst.what}, ${worst.past}px past)` : 'page',
        overflow: doc.scrollHeight - doc.clientHeight,
        allowed: false,
      });
    }
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
        allowed: id === 'scroll-thread' || id === 'scroll-talk' || id === 'scroll-list',
      });
    }
    return out;
  });
}

/**
 * Waits until the screen stops changing: an entrance, a verdict or the summary's arrival has
 * finished, so a shot never keeps an element caught half-faded mid-animation. What moves
 * forever (Buddy's breathing orb, typing dots) never settles and only costs the wait.
 */
export async function settle(page: Page, maxMs = 1600): Promise<void> {
  await page.waitForTimeout(150);
  const until = Date.now() + maxMs;
  let last = await page.screenshot();
  while (Date.now() < until) {
    await page.waitForTimeout(120);
    const next = await page.screenshot();
    if (next.equals(last)) return;
    last = next;
  }
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
    await settle(page);
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
  // What a screen reader would stumble over here (issue #73). `LB_A11Y_SOFT=1` collects
  // every stop instead of stopping at the first one — for a triage round, never for CI.
  const serious = await a11y(page, name);
  if (process.env.LB_A11Y_SOFT === '1') {
    if (serious.length > 0) console.log(`A11Y ${name}: ${serious.join(' · ')}`);
  } else {
    expect(serious, `${name}: accessibility`).toEqual([]);
  }
  return found;
}

/**
 * How tall the pinned bar under a question is (issue #16). What it takes, the question,
 * its figure and the conversation lose — on a small phone with the keyboard open that is
 * the difference between seeing the task and not.
 */
/** How tall one tagged part of a screen is, recorded so slimming stays measured (#64). */
export async function partHeight(page: Page, testId: string, name: string): Promise<number> {
  const part = page.getByTestId(testId);
  if (!(await part.isVisible())) return 0;
  const box = await part.boundingBox();
  const size = page.viewportSize();
  if (!box || !size) return 0;
  const height = Math.round(box.height);
  mkdirSync(SHOTS, { recursive: true });
  appendFileSync(REPORT, `${JSON.stringify({ name, phone: size.width, [testId]: height })}\n`);
  return height;
}

export async function bottomStack(page: Page, name: string): Promise<number> {
  const bar = page.getByTestId('bottom-bar');
  if (!(await bar.isVisible())) return 0;
  const box = await bar.boundingBox();
  const size = page.viewportSize();
  if (!box || !size) return 0;
  const height = Math.round(box.height);
  // What each part of it takes, so slimming it is measured and not guessed.
  const parts = await bar.evaluate((el) =>
    [...el.children].map((c) => Math.round(c.getBoundingClientRect().height)),
  );
  mkdirSync(SHOTS, { recursive: true });
  appendFileSync(
    REPORT,
    `${JSON.stringify({ name, phone: size.width, bottomStack: height, parts })}\n`,
  );
  return height;
}
