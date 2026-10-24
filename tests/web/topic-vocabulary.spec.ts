import { expect, test } from '@playwright/test';
import { onboardChild } from './figureWalk';
import { bothSchemes } from './fit';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`Lena receives topic words and taps vocabulary at ${viewport.width} (#940)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await onboardChild(page, `topic-vocabulary-${viewport.width}`);
    await bothSchemes(page, `topic-vocabulary-before-${viewport.width}`);
    await page
      .getByLabel('Schreib Buddy …')
      .fill('Schick mir 2 englische Vokabeln zur Wohnung im Chat');
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(page.getByText(/the kitchen – die Küche/)).toBeVisible();
    await expect(page.getByText(/the room – das Zimmer/)).toBeVisible();
    await bothSchemes(page, `topic-vocabulary-chat-${viewport.width}`);
    await page.getByRole('button', { name: /^(Los geht's|Weitermachen)$/ }).click();
    await expect(page).toHaveURL(/\/practice\//);
    await expect(page.getByText('the kitchen', { exact: true })).toBeVisible();
    await bothSchemes(page, `topic-vocabulary-practice-${viewport.width}`);
  });
}
