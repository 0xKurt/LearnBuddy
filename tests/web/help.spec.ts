// Browser walkthrough of help at a question (issue #388, report „Hilfe und Fragen beim Üben" §3, §5),
// against the real API with the scripted model (apps/api/src/testing/scenarios/help.ts):
//   - after two misses „Tipp" stands out — the same chip, nothing pushed;
//   - the third miss explains the solution, and a similar task comes right after it;
//   - „Warum stimmt das?" shows three reasons, she taps one, code says whether it is the rule;
//   - in a Probetest asked on options, the fixed line says "antworte", never "schreib";
//   - the review after handing in explains the questions she did not get right.
// Every state is shot at 390×844 and 360×740, light and dark (CLAUDE.md rule 17).

import { expect, test, type Page } from '@playwright/test';

import { onboardChild, startOffer } from './figureWalk';
import { PHONES, settle, shot } from './fit';

/** One state at both phone sizes (`shot`), light and then dark. */
async function both(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-night`);
  await page.emulateMedia({ colorScheme: 'light' });
  await settle(page);
}

const ROWS = 'Welche Rechnung passt zu 3 Reihen mit je 4 Punkten?';
const SIMILAR = 'Welche Rechnung passt zu 5 Reihen mit je 2 Punkten?';
const RIGHT_REASON = 'Weil gleich große Reihen ein Vielfaches derselben Anzahl sind.';

const option = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const tip = (page: Page) => page.getByRole('button', { name: 'Einen Tipp bekommen' });

/** The fill of the Btn's inner View (the Pressable carries none, CLAUDE.md rule 13). */
const fillOf = (page: Page) =>
  tip(page).evaluate((el) => getComputedStyle(el.firstElementChild as Element).backgroundColor);

/**
 * Practice on "Malnehmen": two misses, the third, „Warum stimmt das?", the similar task next. A
 * closed question is held on screen by the screen's own state, which a theme switch remounts —
 * so the run is walked once in each colour scheme, every state shot in the scheme it was reached in.
 */
async function practise(page: Page, scheme: 'light' | 'dark'): Promise<void> {
  const night = scheme === 'dark' ? '-night' : '';
  await page.emulateMedia({ colorScheme: scheme });
  // A new run each time (the first one is only paused by „Übung beenden").
  if (scheme === 'light')
    await startOffer(page, 'Lass uns Malnehmen üben', 'Aufgaben zum Malnehmen');
  else await startOffer(page, 'Lass uns Malnehmen wiederholen', 'noch eine Runde Malnehmen');
  await expect(page.getByText(ROWS)).toBeVisible();
  // The ladder is written in the background right after the start.
  await page.waitForTimeout(500);
  const quiet = await fillOf(page);
  await option(page, '3 + 4').click();
  await expect(page.getByText('Noch nicht ganz – probier', { exact: false })).toBeVisible();
  await option(page, '4 − 3').click();
  await expect(page.getByText('Schau dir die Punkte genau an.')).toBeVisible();
  // ── two misses: „Tipp" stands out, the same chip ──
  await expect.poll(() => fillOf(page)).not.toBe(quiet);
  await shot(page, `388a-tip-offered${night}`);

  // ── the third miss: the worked solution, then „Warum stimmt das?" ──
  await option(page, '4 + 4').click();
  await expect(page.getByText('Drei Reihen mit je vier Punkten', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Warum stimmt das?' }).click();
  await expect(page.getByRole('button', { name: RIGHT_REASON })).toBeVisible();
  await expect(page.getByText('Welcher Grund stimmt?')).toBeVisible();
  await shot(page, `388b-why-reasons${night}`);
  await page.getByRole('button', { name: RIGHT_REASON }).click();
  await expect(page.getByText(`Genau – ${RIGHT_REASON}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Warum stimmt das?' })).toHaveCount(0);
  await shot(page, `388c-why-answered${night}`);

  // ── the similar task comes next, before the question on another topic ──
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText(SIMILAR)).toBeVisible();
  await shot(page, `388d-similar-next${night}`);
  await page.getByRole('button', { name: 'Übung beenden' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

test('help at a question: Tipp offered, similar task, „Warum stimmt das?", the Probetest (issue #388)', async ({
  page,
}) => {
  test.setTimeout(900_000);
  await onboardChild(page, 'help');
  await page.setViewportSize(PHONES[0]);
  await practise(page, 'light');
  await practise(page, 'dark');
  await page.emulateMedia({ colorScheme: 'light' });

  // ── the Probetest she asked for: the line fits the options, the review explains ──
  await startOffer(page, 'Mach einen Probetest zum Malnehmen', 'Probetest zum Malnehmen');
  await expect(page.getByText(ROWS)).toBeVisible();
  const ask = page.getByRole('textbox', { name: 'Deine Frage zur Aufgabe' });
  await expect(async () => {
    await ask.fill('Wie rechnet man das?');
    await expect(ask).toHaveValue('Wie rechnet man das?', { timeout: 1000 });
  }).toPass();
  await page.getByRole('button', { name: 'Senden' }).last().click();
  await expect(
    page.getByText('antworte einfach so, wie du denkst', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('schreib einfach', { exact: false })).toHaveCount(0);
  await both(page, '388e-test-line');
  await option(page, '3 + 4').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await option(page, '12').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await option(page, '5 · 2').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Probetest geschafft!')).toBeVisible();
  await expect(page.getByText('Drei Reihen mit je vier Punkten', { exact: false })).toBeVisible();
  await both(page, '388f-test-review');
});
