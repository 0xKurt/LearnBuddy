import { expect, test } from '@playwright/test';
import { freshEmail, openMenu, planTest, sendWorksheet, signUpMia } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import { PHONES } from './fit';

const LONG_TITLE =
  'Brüche kürzen und vergleichen – Vorbereitung zur Klassenarbeit mit allen Aufgaben, Rechenwegen und passenden Beispielen!';
for (const look of SCREEN_LOOKS) {
  test(`Material complete title: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    expect(LONG_TITLE.trim().length).toBe(120);
    await signUpMia(page, freshEmail('material-title'));
    await planTest(page);
    await sendWorksheet(page);
    const key = await screenLook(page, look);
    await openMenu(page, 'Dein Material');
    await page.getByRole('button', { name: /^Mathe: / }).click();
    // Inside its subject the row opens what can be done with the sheet (ui_kits/app/More.jsx:70,
    // 82–87); "Fragen ansehen" in that sheet leads here.
    await page.getByRole('button', { name: 'Brüche kürzen und vergleichen', exact: true }).click();
    await page
      .locator('[aria-modal="true"]:visible')
      .getByRole('button', { name: 'Fragen ansehen', exact: true })
      .click();
    await expect(page.locator('[aria-modal="true"]:visible')).toHaveCount(0);
    // ui_kits/app/Extra.jsx:111: the head carries the sheet — its name, and "Mathe · 1 Seite".
    await expect(
      page.getByRole('heading', { name: 'Brüche kürzen und vergleichen', exact: true }),
    ).toHaveCount(1);
    await expect(page.getByText('Mathe · 1 Seite', { exact: true })).toBeVisible();
    await screenShots(page, `material-title-${key}-original`);
    // Renaming is the sheet's own action in the head's ⋯ (#599): a row like the places, which
    // reads "Umbenennen" and says what it renames to a screen reader.
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    const rename = page.getByRole('button', { name: /umbenennen$/i });
    await expect(rename).toBeVisible();
    await expect(rename).toHaveAccessibleName('„Brüche kürzen und vergleichen“ umbenennen');
    await expect(rename.getByText('Umbenennen', { exact: true })).toBeVisible();
    await screenShots(page, `material-title-${key}-menu`, true);
    await page.getByRole('button', { name: /umbenennen$/i }).click();
    await page.getByLabel('Name des Blatts').fill(LONG_TITLE);
    await screenShots(page, `material-title-${key}-rename`, true);
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.reload();
    const title = page.getByRole('heading', { name: LONG_TITLE, exact: true });
    await expect(title).toBeVisible();
    // The head's title stays on one line (CLAUDE.md rule 17) however long the name is; the
    // whole name is what a screen reader hears, and what the rename field holds.
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      const line = await title.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        one: Number.parseFloat(getComputedStyle(element).lineHeight),
      }));
      expect(line.height).toBeLessThanOrEqual(line.one + 1);
    }
    await screenShots(page, `material-title-${key}-long`);
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    await page.getByRole('button', { name: /umbenennen$/i }).click();
    await expect(page.getByLabel('Name des Blatts')).toHaveValue(LONG_TITLE);
  });
}
