// Existing real core-loop worksheet, session and grading; no assigned feedback state.
import { AnswerResponse, AnswerRequest } from '../../packages/shared-types/src/contracts/index';
import { expect, test } from '@playwright/test';
import { freshEmail, planTest, sendWorksheet, signUpMia } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';

for (const look of SCREEN_LOOKS) {
  test(`closed typed question versus closed choice: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await signUpMia(page, freshEmail('question-feedback'));
    const key = await screenLook(page, look);
    await planTest(page);
    await sendWorksheet(page);
    await page.getByRole('button', { name: 'Jetzt üben', exact: true }).click();
    const card = page.getByTestId('question-card');
    const prompt = card.getByRole('heading', {
      name: 'Kürze 6/8 und gib das Ergebnis als Dezimalzahl an.',
      exact: true,
    });
    await expect(prompt).toBeVisible();
    await expect(prompt).toHaveCSS('font-size', '22px');
    await screenShots(page, `question-${key}-typed-open`);
    const answer = page.getByLabel('Deine Antwort', { exact: true });
    await answer.fill('0,5');
    const wrong = page.waitForResponse(
      (r) =>
        /\/practice\/sessions\/[^/]+\/answer$/.test(r.url()) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    const wrongResponse = await wrong;
    expect(wrongResponse.ok()).toBe(true);
    const wrongRun = AnswerResponse.parse(await wrongResponse.json()).session;
    const current = wrongRun.items.find((value) => value.item.prompt.startsWith('Kürze 6/8'));
    expect(current?.status).toBe('open');
    expect(AnswerRequest.parse(wrongResponse.request().postDataJSON())).toMatchObject({
      item_id: current?.item.id,
      text: '0,5',
    });
    await expect(prompt).toHaveCSS('font-size', '22px');
    await expect(answer).toBeVisible();
    await answer.fill('0,75');
    const checked = page.waitForResponse(
      (r) =>
        /\/practice\/sessions\/[^/]+\/answer$/.test(r.url()) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    const response = await checked;
    expect(response.ok()).toBe(true);
    const run = AnswerResponse.parse(await response.json()).session;
    expect(run.items.find((value) => value.item.id === current?.item.id)?.status).toBe('correct');
    await expect(prompt).toHaveCSS('font-size', '15px');
    await expect(prompt).toHaveCSS('line-height', '21px');
    // RN Web serializes zero tracking as CSS normal; both denote no extra tracking.
    await expect
      .poll(() =>
        prompt.evaluate((node) => {
          const spacing = getComputedStyle(node).letterSpacing;
          return spacing === 'normal' ? 0 : Number.parseFloat(spacing);
        }),
      )
      .toBe(0);
    const ink = paletteOf(themeNameOf(look.family, look.dark)).ink2;
    const number = Number.parseInt(ink.slice(1), 16);
    await expect(prompt).toHaveCSS(
      'color',
      `rgb(${number >> 16}, ${(number >> 8) & 255}, ${number & 255})`,
    );
    await expect(card.getByTestId('question-meta')).toHaveCount(0);
    await expect(answer).toHaveCount(0);
    await screenShots(page, `question-${key}-typed-closed`);
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await page.getByRole('radio', { name: '2 Drittel', exact: true }).click();
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeVisible();
    // MathText wraps mixed fractions in a semantic heading; inspect actual painted text nodes.
    await expect
      .poll(() =>
        card
          .getByRole('heading')
          .evaluate((node) =>
            [...node.querySelectorAll('*')]
              .filter((child) =>
                [...child.childNodes].some(
                  (text) =>
                    text.nodeType === Node.TEXT_NODE &&
                    (text.textContent ?? '').trim() === 'Welcher',
                ),
              )
              .map((child) => getComputedStyle(child).fontSize),
          ),
      )
      .toEqual(['22px']);
    await expect(card.getByTestId('question-meta')).toHaveCount(1);
    await screenShots(page, `question-${key}-choice-closed-normal`);
  });
}
