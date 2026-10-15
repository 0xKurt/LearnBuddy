// Seen, not only "visible" (#738). Playwright's `toBeVisible` counts an element at opacity 0 as
// visible: on #734's old head every entrance stayed at opacity 0 on the web — the new chat line,
// the head's title — and `core-loop-plan` and `redesign-chat` still passed; only the screenshots
// showed the receipt "Eingetragen: …" missing (CLAUDE.md rule 5: never claim what isn't proven).
//
// `expectSeen` asks what she sees: the element is visible, and its opacity multiplied down every
// ancestor (computed style — an entrance writes it on the element or a wrapper, frame by frame,
// components/lb/Motion.tsx) is above zero once the entrance has settled.

import { expect, type Locator } from '@playwright/test';

/** Runs in the page: the opacity she sees of `el`, every ancestor's multiplied in. */
export function seenOpacity(el: Element): number {
  let opacity = 1;
  for (let e: Element | null = el; e; e = e.parentElement) {
    opacity *= Number.parseFloat(getComputedStyle(e).opacity);
  }
  return opacity;
}

/** How long an opacity must stand still to count as settled: past one entrance's frames. */
const SETTLED_MS = 150;

/**
 * Asserts that `target` is visible and that she can see it: once its opacity has settled (two
 * samples `SETTLED_MS` apart agree, or the time is up), the opacity down its ancestors is above
 * zero. An entrance that never ends stays at 0 and fails here, where `toBeVisible` passes.
 */
export async function expectSeen(
  target: Locator,
  options: { timeout?: number; what?: string } = {},
): Promise<void> {
  const timeout = options.timeout ?? 5_000;
  await expect(target).toBeVisible({ timeout });
  const until = Date.now() + timeout;
  let now = await target.evaluate(seenOpacity);
  for (;;) {
    await target.page().waitForTimeout(SETTLED_MS);
    const next = await target.evaluate(seenOpacity);
    const settled = next === now;
    now = next;
    if ((settled && now > 0) || Date.now() > until) break;
  }
  const what = options.what ?? target.toString();
  expect(now, `${what}: seen, not only visible (opacity down its ancestors)`).toBeGreaterThan(0);
}
