import { expect, test } from '@playwright/test';
import { onboardChild, startOffer } from './figureWalk';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
for (const look of SCREEN_LOOKS)
  test(`Start single Composer: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    await onboardChild(page, 'start-redesign');
    const key = await screenLook(page, look);
    await page.getByRole('button', { name: 'Einfach mal üben', exact: true }).click();
    await page.getByRole('button', { name: 'Hausaufgabe', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Aufgabe fotografieren', exact: true }),
    ).toBeVisible();
    await screenShots(page, `start-${key}-choices`, true);
    await page.getByRole('button', { name: 'Aufgabe eintippen', exact: true }).click();
    const sheet = page.locator('[aria-modal="true"]:visible');
    await expect(sheet).toHaveCount(1);
    await expect(sheet.getByRole('textbox')).toHaveCount(1);
    await expect(sheet.getByTestId('composer-primary')).toHaveCount(1);
    const submit = sheet.getByRole('button', { name: "Los geht's", exact: true });
    await expect(submit).toHaveCount(1);
    await expect(submit).toBeDisabled();
    const field = sheet.getByRole('textbox');
    await field.fill('Ein Rechteck ist 7 cm lang und 4 cm breit. Berechne den Flächeninhalt.');
    await expect(submit).toBeEnabled();
    await screenShots(page, `start-${key}`, true);
    await submit.click();
    await expect(
      page.getByText('Hausaufgabe – ich gebe dir Tipps, die Lösung findest du selbst.'),
    ).toBeVisible();
    await expect(page.getByLabel('Deine Antwort')).toBeVisible();
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Profil', exact: true })).toBeVisible();
    // Her own homework task is intentionally not flaggable (questionOffers).
    await expect(page.getByRole('button', { name: 'Frage passt nicht', exact: true })).toHaveCount(
      0,
    );
    await screenShots(page, `start-${key}-practice-menu`, true);
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await page.getByRole('button', { name: 'Übung beenden', exact: true }).click();
    await expect(page).toHaveURL(/\/buddy$/);
    await startOffer(page, 'Lass uns Vokabeln mit Frosch üben', 'zwei Wörter aus Unité 3');
    await expect(page.getByRole('heading', { name: 'la grenouille', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Frage passt nicht', exact: true }),
    ).toBeVisible();
    await screenShots(page, `start-${key}-generated-menu`, true);
    await page.getByRole('button', { name: 'Frage passt nicht', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Frage passt nicht?', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[aria-modal="true"]:visible')).toHaveCount(1);
  });
