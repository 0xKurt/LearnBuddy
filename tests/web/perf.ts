// What the app's own stopwatch measured during a walkthrough (issue #66): the span from a
// tap to the moment the screen shows its result. The app records it in memory
// (apps/mobile/lib/perf.ts) and exposes it on the web; here it is written next to the fit
// report so a run can be compared with the one before.
//
// No budget yet on purpose: first measure, then decide what "too slow" means (the speed
// audit in #59 asks for exactly that order).

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Page } from '@playwright/test';

const REPORT = join(__dirname, '../../test-results/web/perf.jsonl');

export type PerfSpan = { action: string; ms: number };

/** Reads (and clears) what the app measured so far, and records it under `name`. */
export async function recordPerf(page: Page, name: string): Promise<PerfSpan[]> {
  const spans = await page.evaluate(() => {
    const global = globalThis as { __lbPerf?: Array<{ action: string; ms: number }> };
    const found = global.__lbPerf ?? [];
    global.__lbPerf = [];
    return found;
  });
  if (spans.length === 0) return [];
  mkdirSync(dirname(REPORT), { recursive: true });
  appendFileSync(REPORT, `${JSON.stringify({ name, spans })}\n`);
  return spans;
}
