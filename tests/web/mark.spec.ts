// Browser walkthrough of marking (issue #234), against the real API with the scripted model
// (apps/api/src/testing/scenarios/mark.ts). She taps words, the word a comma belongs after, or
// the letter a syllable ends with; a second tap takes it back; with categories she chooses one
// first. Every case is the LARGEST its mode may be (contracts/structured.ts, MARK_*), and every
// `shot` measures at 390×844 and 360×740 that nothing has to be scrolled and every target is a
// 44-pt button (tests/web/fit.ts), also with Buddy's counting reply above.

import { expect, test, type Page } from '@playwright/test';

import { PHONES, shot } from './fit';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`mark-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2015');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/** One state at both phone sizes (`shot`), light and then dark. */
async function both(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-night`);
  await page.emulateMedia({ colorScheme: 'light' });
}

/** Asks Buddy, opens the practice he offers and waits for its question. */
async function start(page: Page, ask: string, reply: string, prompt: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(ask);
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText(reply, { exact: false })).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText(prompt)).toBeVisible();
}

/**
 * Every target is at least 44 pt high and `minWidth` wide (issue #234 acceptance, rule: touch
 * targets): 44 for a word; a letter of a word to split is one 30-pt cell, and the cells touch.
 */
async function targetsAreLarge(page: Page, minWidth = 44): Promise<void> {
  // The theme switch in `both` remounts the tree: measure all targets in one snapshot of the
  // page, polled until the new tree stands (an element read one by one may be replaced between).
  const smallest = () =>
    page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[role="checkbox"]')].map((e) =>
        e.getBoundingClientRect(),
      );
      return boxes.length === 0
        ? { w: 0, h: 0 }
        : { w: Math.min(...boxes.map((b) => b.width)), h: Math.min(...boxes.map((b) => b.height)) };
    });
  await expect.poll(async () => (await smallest()).w).toBeGreaterThanOrEqual(minWidth);
  await expect.poll(async () => (await smallest()).h).toBeGreaterThanOrEqual(44);
}

async function finish(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Stimmt', { exact: false }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
}

test('markieren: words, categories, commas and syllables, counted by code (issue #234)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize(PHONES[0]);
  const word = (name: string) => page.getByRole('checkbox', { name, exact: true });
  const check = page.getByRole('button', { name: 'Prüfen' });

  // ── 24 words, the nouns to find ──
  await start(page, 'Lass uns Nomen markieren', 'tipp die Nomen an', 'Tippe alle Nomen an.');
  await expect(page.getByRole('checkbox')).toHaveCount(24);
  await expect(check).toBeDisabled();
  await both(page, '46a-mark-words-start');
  await targetsAreLarge(page);
  for (const w of ['montag', 'familie', 'auto', 'fährt']) await word(w).click();
  await word('fährt').click();
  await expect(word('fährt')).toHaveAttribute('aria-checked', 'false');
  await word('fährt').click();
  await check.click();
  const counted = 'Noch nicht ganz: 3 richtig, 7 fehlen noch, 1 zu viel.';
  await expect(page.getByText(counted)).toBeInViewport();
  await both(page, '46b-mark-words-feedback');
  await word('fährt').click();
  for (const w of ['meer', 'bruder', 'burg', 'sand', 'schwester', 'muscheln', 'strand']) {
    await word(w).click();
  }
  await finish(page);

  // ── 8 words sorted into three categories ──
  await start(page, 'Ich will Satzglieder bestimmen', 'erst die Art wählen', 'Markiere Subjekt');
  await expect(page.getByRole('radio', { name: '① Subjekt' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  for (const w of ['Die', 'Oma']) await word(w).click();
  await page.getByRole('radio', { name: '② Prädikat' }).click();
  await word('liest').click();
  await word('den').click();
  await both(page, '46c-mark-categories');
  await targetsAreLarge(page);
  await check.click();
  await expect(page.getByText('Noch nicht ganz: 3 richtig', { exact: false })).toBeInViewport();
  await both(page, '46d-mark-categories-feedback');
  await page.getByRole('checkbox', { name: 'den, markiert als Prädikat' }).click();
  await word('vor').click();
  await page.getByRole('radio', { name: '③ Objekt' }).click();
  for (const w of ['eine', 'Geschichte']) await word(w).click();
  // Everything marked: the longest line saying what is marked, under Buddy's reply.
  await expect(page.getByTestId('mark-summary')).toHaveText(
    'Subjekt: Die Oma; Prädikat: liest, vor; Objekt: eine Geschichte',
  );
  await both(page, '46e-mark-categories-all');
  await finish(page);

  // ── a sentence of 16 words with two commas to set ──
  await start(page, 'Lass uns Kommas setzen', 'hinter das ein Komma gehört', 'Setze die fehlenden');
  await expect(page.getByRole('checkbox')).toHaveCount(15);
  await page.getByRole('checkbox', { name: 'Komma nach „ankamen“' }).click();
  // The same one line of how-to as every other kind of marking.
  await expect(page.getByTestId('mark-how')).toHaveText(
    'Tippe das Wort an, nach dem ein Komma fehlt.',
  );
  await both(page, '46f-mark-commas');
  await targetsAreLarge(page);
  await page.getByRole('checkbox', { name: 'Komma nach „weg“' }).click();
  await finish(page);

  // ── four words of up to ten letters, one per row ──
  await start(page, 'Ich möchte Silben trennen', 'nach dem eine Silbe endet', 'Trenne die Wörter');
  await page.getByRole('checkbox', { name: 'Silbe endet nach „Re“ in Regenbogen' }).click();
  await page.getByRole('checkbox', { name: 'Silbe endet nach „Regen“ in Regenbogen' }).click();
  await expect(page.getByTestId('syllable-cut')).toHaveCount(2);
  await both(page, '46g-mark-syllables');
  await targetsAreLarge(page, 30);
  // One word, one row: every letter of "Regenbogen" stands on the same line.
  const tops = new Set<number>();
  for (const box of await page.getByRole('checkbox', { name: /in Regenbogen$/ }).all()) {
    tops.add(Math.round((await box.boundingBox())?.y ?? -1));
  }
  expect(tops.size).toBe(1);
});
