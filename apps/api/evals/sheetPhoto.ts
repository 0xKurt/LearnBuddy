// A worksheet photographed the way a phone would, for the live evals that read sheets (the content
// eval #77, the grade-10 probe #297): HTML rendered in Chromium and shot as a JPEG page. One browser
// per eval run, closed at its end.
// requires live verification in Claude Code session (needs Chromium; LB_CHROMIUM or Playwright's own)

import { chromium } from '@playwright/test';

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

/** The sheet `html` as one photographed page (JPEG). */
export async function photographSheet(html: string): Promise<Uint8Array> {
  browser ??= await chromium.launch(
    process.env.LB_CHROMIUM ? { executablePath: process.env.LB_CHROMIUM } : {},
  );
  const page = await browser.newPage({ viewport: { width: 820, height: 1100 } });
  await page.setContent(
    `<body style="font-family: 'DejaVu Sans', sans-serif; padding: 40px; background: #fdfdf8; font-size: 22px; line-height: 1.5">${html}</body>`,
  );
  const shot = await page.screenshot({ type: 'jpeg', quality: 85 });
  await page.close();
  return new Uint8Array(shot);
}

/** Closes the eval's browser, if one was started. */
export async function closeSheetBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}
