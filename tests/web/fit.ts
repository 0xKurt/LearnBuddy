// "No scrolling" check for the walkthroughs (CLAUDE.md rule 16, docs/UX-PRINCIPLES.md):
// every screen is measured at real phone sizes and the walkthrough fails when
// anything has to be scrolled to be seen. Two kinds of areas may grow, because
// that is what they are: a conversation (testID "scroll-thread", newest at the
// bottom, always shown at its end) and a list she browses on purpose
// ("scroll-list": her material, her memories, a test's review) — the actions
// around them stay pinned. And a reading text above its question ("scroll-text",
// issue #233) scrolls in its own fixed box, so the question under it never moves. Screenshots are taken at the real size, so they show
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

/**
 * The most that may stand empty between the answer and what is below it (issue #386): the pinned
 * bar's own padding above "Prüfen", or the room the screen's edge needs under options she taps.
 * More is a hole — the answer floating above the bottom instead of standing on it.
 */
const ANSWER_GAP = 24;

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
        allowed:
          id === 'scroll-thread' ||
          id === 'scroll-talk' ||
          id === 'scroll-list' ||
          // A reading text above its question (issue #233): "nur ein Text scrollt".
          id === 'scroll-text',
      });
    }
    return out;
  });
}

/**
 * Where the answer stands (issues #310, #386): one rule for every form — at the bottom. What lies
 * between it and the action (or the bottom edge), and where the free room is.
 */
export type AnswerPlace = {
  /**
   * The empty band under the answer (and its keys): from its lowest edge to the first thing drawn
   * below it — "Prüfen", the voice slot, the input bar — or to the window's bottom edge where the
   * answer itself is the action (options she taps). 0: no slot.
   */
  gap: number;
  /** Every free room lies above the answer, between the conversation and it. */
  spacerAbove: boolean;
  /** "Prüfen" is the lowest of answer, keys, free room and action. */
  actionLowest: boolean;
  /**
   * A typed answer's field is in the pinned bar, right above "Prüfen" (or with it inside while she
   * types), at the bottom like the chat's (issue #365).
   */
  fieldInBar: boolean;
};

/**
 * The one rule of the answer shell, measured (issues #310 §3.4, #386): every answer stands at the
 * bottom — directly above its action ("Prüfen", the voice slot, the input bar it writes into), or
 * at the window's bottom edge where the tap on it is the action. The free room collects above it,
 * between the conversation and the answer, never under it; "Prüfen" is lowest. A typed answer is
 * written in the input bar right above "Prüfen" (issue #365). Null where neither an answer slot
 * nor a typed answer is on screen (an answered question, any other screen).
 */
export async function answerPlace(page: Page): Promise<AnswerPlace | null> {
  return page.evaluate(() => {
    const visible = (el: HTMLElement | null): el is HTMLElement => {
      const box = el?.getBoundingClientRect();
      return box !== undefined && box.height > 0 && box.width > 0;
    };
    const slotEl = document.querySelector<HTMLElement>('[data-testid="answer-slot"]');
    const field = document.querySelector<HTMLElement>('[data-testid="answer-field"]');
    const slot = visible(slotEl) ? slotEl : null;
    if (!slot && !visible(field)) return null;
    const bars = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="bottom-bar"]'));
    const fieldInBar = !visible(field) || bars.some((bar) => bar.contains(field));
    // A typed answer without a board: the field is the answer, and it is in the bar.
    if (!slot) return { gap: 0, spacerAbove: true, actionLowest: true, fieldInBar };
    const at = slot.getBoundingClientRect();
    const boxOf = (id: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`))
        .map((el) => el.getBoundingClientRect())
        .filter((b) => b.height > 0 || id === 'free-space');
    // A board's keys stand under it; a typed answer's stand in the pinned bar, above its field.
    const keyEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="answer-keys"]'),
    ).filter((el) => !bars.some((bar) => bar.contains(el)));
    const keys = keyEls.map((el) => el.getBoundingClientRect()).filter((b) => b.height > 0);
    const answerTop = Math.min(at.top, ...keys.map((b) => b.top));
    const answerEnd = Math.max(at.bottom, ...keys.map((b) => b.bottom));
    // The first thing drawn below the answer: text, a picture, a control — as far as its scroll
    // box shows it. Nothing: the window's bottom edge.
    let below = innerHeight;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (slot.contains(el) || el.contains(slot)) continue;
      if (keyEls.some((k) => k.contains(el) || el.contains(k))) continue;
      const drawn =
        Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        ) ||
        ['IMG', 'CANVAS', 'svg', 'INPUT', 'TEXTAREA'].includes(el.tagName) ||
        el.getAttribute('role') === 'button';
      if (!drawn) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.opacity === '0') continue;
      const box = el.getBoundingClientRect();
      if (box.height === 0 || box.width === 0) continue;
      if (box.right <= at.left || box.left >= at.right) continue;
      let top = box.top;
      let bottom = box.bottom;
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (!['auto', 'scroll', 'hidden'].includes(getComputedStyle(p).overflowY)) continue;
        const clip = p.getBoundingClientRect();
        top = Math.max(top, clip.top);
        bottom = Math.min(bottom, clip.bottom);
      }
      if (bottom <= top || top < answerEnd - 1) continue;
      below = Math.min(below, top);
    }
    const spacers = boxOf('free-space');
    const actions = boxOf('answer-action');
    const lowestBefore = Math.max(answerEnd, ...spacers.map((b) => b.bottom));
    return {
      gap: Math.round(below - answerEnd),
      // A spacer squeezed to nothing has no side; one with room must be above the answer.
      spacerAbove: spacers.every((b) => b.height < 1 || b.bottom <= answerTop + 1),
      actionLowest: actions.every((b) => b.top >= lowestBefore - 1),
      fieldInBar,
    };
  });
}

/**
 * A small phone with the keyboard up (issue #310, #309 Abnahme 2): the 360×740 phone keeps
 * 740 − 300 pt, a small Android keyboard being about 300 dp (the same room modes.spec gives its
 * keyboard shots; core-loop checks the chat at a rounder 420). The web cannot open a keyboard;
 * the window shrinks by its height, as Android does on its own (adjustResize, issue #46).
 */
const KEYBOARD_ROOM = { width: 360, height: 740 - 300 } as const;

/**
 * Where a typed answer stands, the keyboard pass: the field has the focus (so the math keys show,
 * as while she types), and the field, "Prüfen" under it and anything said as an alert (a toast,
 * the mic's problem) are all inside the window — the bar at the bottom rides on the keyboard, as
 * the chat's does (issue #365).
 */
async function keyboardPass(page: Page, name: string): Promise<void> {
  const field = page.locator('[data-testid="answer-field"]').last();
  const wasFocused = await field.evaluate((el) => el === document.activeElement);
  await page.setViewportSize(KEYBOARD_ROOM);
  await field.focus();
  await settle(page);
  await page.screenshot({ path: join(SHOTS, `${name}-kb.png`) });
  const alerts = page.locator('[role="alert"]:visible');
  // How far "Prüfen" lies under the keyboard is recorded: while she types it stands in the bar
  // (issue #365), so it rides on the keyboard with the field.
  // While she types, "Prüfen" stands in the bar itself once there is something to check (#365).
  const action = page.getByTestId('answer-action');
  const actionPast =
    (await action.count()) === 0
      ? null
      : await action
          .last()
          .evaluate((el) =>
            Math.max(0, Math.round(el.getBoundingClientRect().bottom - innerHeight)),
          );
  const record = {
    name,
    phone: 'kb',
    alerts: await alerts.count(),
    actionPast,
    place: await answerPlace(page),
  };
  appendFileSync(REPORT, `${JSON.stringify(record)}\n`);
  await expect(field, `${name} @kb: the field above the keyboard`).toBeInViewport({ ratio: 1 });
  for (const alert of await alerts.all()) {
    await expect(alert, `${name} @kb: what is said as an alert`).toBeInViewport();
  }
  if (!wasFocused) await field.blur();
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
  {
    opened = false,
    phones = PHONES,
  }: {
    opened?: boolean;
    /**
     * Only these sizes. For a state that does not survive a resize: the walkthrough's
     * resizing remounts the full-screen talk modal, so a turn in progress is shot at the size
     * it was started in (talk-voice.spec.ts).
     */
    phones?: ReadonlyArray<{ width: number; height: number }>;
  } = {},
): Promise<Overflow[]> {
  mkdirSync(SHOTS, { recursive: true });
  const size = page.viewportSize();
  const found: Overflow[] = [];
  for (const phone of phones) {
    await page.setViewportSize(phone);
    await settle(page);
    const here = await overflows(page);
    found.push(...here);
    const place = await answerPlace(page);
    appendFileSync(
      REPORT,
      `${JSON.stringify({ name, phone: phone.width, overflows: here, ...(place ? { place } : {}) })}\n`,
    );
    if (place) {
      // One rule for every form in the answer shell (issue #386): the answer at the bottom.
      expect(
        place.gap,
        `${name} @${phone.width}: empty band under the answer (it belongs at the bottom)`,
      ).toBeLessThanOrEqual(ANSWER_GAP);
      expect(place.spacerAbove, `${name} @${phone.width}: free room above the answer`).toBe(true);
      expect(place.actionLowest, `${name} @${phone.width}: "Prüfen" lowest`).toBe(true);
      expect(place.fieldInBar, `${name} @${phone.width}: the field in the bar above "Prüfen"`).toBe(
        true,
      );
    }
    await page.screenshot({
      path: join(SHOTS, phone.width === 390 ? `${name}.png` : `${name}-${phone.width}.png`),
    });
  }
  // A typed answer: once more with the keyboard up.
  if ((await page.locator('[data-testid="answer-field"]').count()) > 0)
    await keyboardPass(page, name);
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
  // Measured once the page stands still. A theme switch remounts the whole tree (ThemeProvider
  // `key`, issues #84/#148) about 100 ms after `emulateMedia` returns. Measured right after the
  // switch, the part read 0 pt in 2 of 4 runs in CI order — the intermittent "figure 0pt" of
  // modes.spec (CI run 37094324242) — most likely because the element `isVisible` saw was
  // replaced before `boundingBox` read it. The app is not at fault: watched with a
  // MutationObserver over the same switch, every committed frame has the figure, the new tree's
  // first at its 60 pt frame and the next at full size.
  await settle(page);
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
