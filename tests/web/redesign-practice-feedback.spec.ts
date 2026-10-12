import { expect, test } from '@playwright/test';
import { onboardChild, startOffer } from './figureWalk';
import { PHONES } from './fit';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
for (const look of SCREEN_LOOKS) {
  test(`Practice feedback alignment: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await onboardChild(page, 'practice-feedback');
    const key = await screenLook(page, look);
    await startOffer(page, 'Lass uns Schemata üben', 'Schemata mit Lücken');
    await page.getByLabel('Deine Antwort').fill('Kondensation');
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
    const answer = page.getByLabel('Du: Kondensation', { exact: true });
    const verdict = page.getByLabel('Richtig', { exact: true });
    await expect(verdict).toBeVisible();
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await expect
        .poll(
          async () => {
            const bubble = await answer.boundingBox();
            const tag = await verdict.boundingBox();
            if (!bubble || !tag) return null;
            return Math.abs(bubble.x + bubble.width - (tag.x + tag.width));
          },
          {
            message: 'the judgement aligns under the actual learner answer, not across the screen',
          },
        )
        .toBeLessThanOrEqual(1);
    }
    await screenShots(page, `practice-screen-final-feedback-${key}`);
  });
}
