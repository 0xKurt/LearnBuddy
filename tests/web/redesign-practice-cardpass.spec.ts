import { expect, test } from '@playwright/test';
import { onboardChild, startOffer } from './figureWalk';
import { screenLook, SCREEN_LOOKS, screenShots } from './redesign-screen-matrix';

test('Practice CardPass: real missed word, one bar, turn and tutor question', async ({ page }) => {
  test.setTimeout(240_000);
  await onboardChild(page, 'practice-cards');
  await screenLook(page, SCREEN_LOOKS[3]);
  await startOffer(page, 'Lass uns Vokabeln mit Frosch üben', 'zwei Wörter aus Unité 3');
  const answer = async (text: string) => {
    await page.getByLabel('Deine Antwort').fill(text);
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
  };
  await answer('die Kröte');
  await expect(page.getByText('Versuch es nochmal', { exact: false })).toBeVisible();
  for (const text of ['der Frosch', 'die Zitrone', 'la grenouille', 'le citron']) {
    await answer(text);
    await expect(page.getByText('Richtig', { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Die Wörter als Karten durchgehen', exact: true }).click();
  await expect(page.getByText('Karte 1 von 1', { exact: true })).toBeVisible();
  await expect(page.getByTestId('ask-field')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Umdrehen', exact: true })).toBeVisible();
  await screenShots(page, 'practice-screen-cardpass-front');
  await page.getByTestId('ask-field').fill('Ist grenouille weiblich?');
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText('das „la“ zeigt es', { exact: false })).toBeVisible();
  await expect(page.getByText('Karte 1 von 1', { exact: true })).toBeVisible();
  await screenShots(page, 'practice-screen-cardpass-tutor');
  await page.getByRole('button', { name: 'Umdrehen', exact: true }).click();
  await expect(page.getByText('der Frosch', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Noch nicht', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wusste ich', exact: true })).toBeVisible();
  await screenShots(page, 'practice-screen-cardpass-back');
  // PassEnd belongs to the later unit; this proof ends at the real recall controls.
});
