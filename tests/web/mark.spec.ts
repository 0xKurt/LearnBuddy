// Browser walkthrough of marking (issue #234), against the real API with the scripted model
// (apps/api/src/testing/scenarios/mark.ts). She taps words, the word a comma belongs after, or
// the letter a syllable ends with; a second tap takes it back; with categories she chooses one
// first. Every case is the LARGEST its mode may be (contracts/structured.ts, MARK_*), and every
// `shot` measures at 390×844 and 360×740 that nothing has to be scrolled and every target is a
// 44-pt button (tests/web/fit.ts), also with Buddy's counting reply above.

import { expect, test, type Page } from '@playwright/test';

import { bothSchemes, PHONES } from './fit';

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
  // Nine stops, each at both sizes, light and dark, and with the keyboard up: 1.9–2.6 min before
  // #464, at the 3 min default once every switch back to light waited for the app (`bothSchemes`).
  test.setTimeout(300_000);
  await onboardChild(page);
  await page.setViewportSize(PHONES[0]);
  const word = (name: string) => page.getByRole('checkbox', { name, exact: true });
  const check = page.getByRole('button', { name: 'Prüfen' });

  // ── 24 words, the nouns to find ──
  await start(page, 'Lass uns Nomen markieren', 'tipp die Nomen an', 'Tippe alle Nomen an.');
  await expect(page.getByRole('checkbox')).toHaveCount(24);
  await expect(check).toBeDisabled();
  await bothSchemes(page, '46a-mark-words-start');
  await targetsAreLarge(page);
  for (const w of ['montag', 'familie', 'auto', 'fährt']) await word(w).click();
  await word('fährt').click();
  await expect(word('fährt')).toHaveAttribute('aria-checked', 'false');
  await word('fährt').click();
  await check.click();
  const counted = 'Noch nicht ganz: 3 richtig, 7 fehlen noch, 1 zu viel.';
  await expect(page.getByText(counted)).toBeInViewport();
  await bothSchemes(page, '46b-mark-words-feedback');
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
  await word('Oma').click();
  await page.getByRole('radio', { name: '② Prädikat' }).click();
  await word('liest').click();
  await word('den').click();
  await bothSchemes(page, '46c-mark-categories');
  await targetsAreLarge(page);
  await check.click();
  await expect(page.getByText('Noch nicht ganz: 2 richtig', { exact: false })).toBeInViewport();
  await bothSchemes(page, '46d-mark-categories-feedback');
  await page.getByRole('checkbox', { name: 'den, markiert als Prädikat' }).click();
  await word('vor').click();
  await page.getByRole('radio', { name: '③ Akkusativobjekt' }).click();
  for (const w of ['eine', 'Geschichte']) await word(w).click();
  // Everything marked: the longest line saying what is marked, under Buddy's reply.
  await expect(page.getByTestId('mark-summary')).toHaveText(
    'Subjekt: Oma; Prädikat: liest, vor; Akkusativobjekt: eine Geschichte',
  );
  await bothSchemes(page, '46e-mark-categories-all');
  await finish(page);

  // ── the worst case of sorting: three long terms on two rows, the most words, the reply ──
  await start(page, 'Lass uns Objekte unterscheiden', 'drei Arten von Objekten', 'Markiere Dativ');
  for (const w of ['den', 'Enkeln', 'erzählt']) await word(w).click();
  await check.click();
  const worst = 'Noch nicht ganz: 2 richtig, 3 fehlen noch, 1 zu viel.';
  await expect(page.getByText(worst)).toBeInViewport();
  await page.getByRole('checkbox', { name: 'erzählt, markiert als Dativobjekt' }).click();
  await page.getByRole('radio', { name: '② Präpositionalobjekt' }).click();
  for (const w of ['von', 'Abenteuern']) await word(w).click();
  await page.getByRole('radio', { name: '③ Subjekt' }).click();
  await word('Großvater').click();
  await expect(page.getByTestId('mark-summary')).toHaveText(
    'Dativobjekt: den Enkeln; Präpositionalobjekt: von Abenteuern; Subjekt: Großvater',
  );
  // Everything marked, the longest terms on two rows of buttons, Buddy's reply still in view.
  await expect(page.getByText(worst)).toBeInViewport();
  await bothSchemes(page, '46h-mark-categories-worst');
  await targetsAreLarge(page);
  await finish(page);

  // ── a long Satzglieder sentence (#368): ten words in two rows, every word marked, the reply ──
  await start(page, 'Satzglieder im langen Satz', 'ein langer Satz', 'Markiere Dativobjekt');
  for (const w of ['seiner', 'Tochter']) await word(w).click();
  await page.getByRole('radio', { name: '② Akkusativobjekt' }).click();
  for (const w of ['ein', 'neues', 'Fahrrad', 'Am']) await word(w).click();
  await check.click();
  const long = 'Noch nicht ganz: 5 richtig, 2 fehlen noch, 1 zu viel.';
  await expect(page.getByText(long)).toBeInViewport();
  await page.getByRole('checkbox', { name: 'Am, markiert als Akkusativobjekt' }).click();
  await page.getByRole('radio', { name: '③ Subjekt' }).click();
  for (const w of ['der', 'Vater']) await word(w).click();
  await expect(page.getByTestId('mark-summary')).toHaveText(
    'Dativobjekt: seiner Tochter; Akkusativobjekt: ein neues Fahrrad; Subjekt: der Vater',
  );
  // Everything marked, Buddy's reply still in view, the ten words in two rows of tiles — the
  // digit stands under its word, so a mark never pushes a word into a third row.
  await expect(page.getByText(long)).toBeInViewport();
  await bothSchemes(page, '46i-mark-categories-long');
  await targetsAreLarge(page);
  const tileRows = () =>
    page.evaluate(
      () =>
        new Set(
          [...document.querySelectorAll('[data-testid="mark-text"] [role="checkbox"]')].map((e) =>
            Math.round(e.getBoundingClientRect().y),
          ),
        ).size,
    );
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await expect.poll(tileRows).toBe(2);
  }
  await page.setViewportSize(PHONES[0]);
  await finish(page);

  // ── a sentence of 16 words with two commas to set ──
  await start(page, 'Lass uns Kommas setzen', 'hinter das ein Komma gehört', 'Setze die fehlenden');
  await expect(page.getByRole('checkbox')).toHaveCount(15);
  await page.getByRole('checkbox', { name: 'Komma nach „ankamen“' }).click();
  // The same one line of how-to as every other kind of marking.
  await expect(page.getByTestId('mark-how')).toHaveText(
    'Tippe das Wort an, nach dem ein Komma fehlt.',
  );
  await bothSchemes(page, '46f-mark-commas');
  await targetsAreLarge(page);
  await page.getByRole('checkbox', { name: 'Komma nach „weg“' }).click();
  await finish(page);

  // ── four words of up to ten letters, one per row ──
  await start(page, 'Ich möchte Silben trennen', 'nach dem eine Silbe endet', 'Trenne die Wörter');
  await page.getByRole('checkbox', { name: 'Silbe endet nach „Re“ in Regenbogen' }).click();
  await page.getByRole('checkbox', { name: 'Silbe endet nach „Regen“ in Regenbogen' }).click();
  await expect(page.getByTestId('syllable-cut')).toHaveCount(2);
  await bothSchemes(page, '46g-mark-syllables');
  await targetsAreLarge(page, 30);
  // One word, one row: every letter of "Regenbogen" stands on the same line. Read in one snapshot
  // of the page, like `targetsAreLarge`: read one by one, a box the theme switch's remount had just
  // replaced came back without a box (-1), a second "row" (full walkthrough 05.10.).
  const rows = () =>
    page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[role="checkbox"]')].filter((e) =>
        /in Regenbogen$/.test(e.getAttribute('aria-label') ?? ''),
      );
      return boxes.length === 0
        ? 0
        : new Set(boxes.map((e) => Math.round(e.getBoundingClientRect().y))).size;
    });
  await expect.poll(rows).toBe(1);
});
