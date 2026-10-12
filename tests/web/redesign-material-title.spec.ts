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
    await page
      .getByRole('button', {
        name: 'Fragen aus „Brüche kürzen und vergleichen“ ansehen',
        exact: true,
      })
      .click();
    await expect(page.getByRole('heading', { name: 'Dein Material', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Brüche kürzen und vergleichen', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Mathe · 4 Aufgaben', { exact: true })).toBeVisible();
    await screenShots(page, `material-title-${key}-original`);
    await page
      .getByRole('button', { name: '„Brüche kürzen und vergleichen“ umbenennen', exact: true })
      .click();
    await page.getByLabel('Name des Blatts').fill(LONG_TITLE);
    await screenShots(page, `material-title-${key}-rename`, true);
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await page.reload();
    const title = page.getByRole('heading', { name: LONG_TITLE, exact: true });
    await expect(title).toBeVisible();
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await expect
        .poll(
          () =>
            title.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(element);
              const rectangles = Array.from(range.getClientRects());
              return (
                rectangles.length > 0 &&
                rectangles.every(
                  (rect) =>
                    rect.left >= bounds.left - 1 &&
                    rect.right <= bounds.right + 1 &&
                    rect.top >= bounds.top - 1 &&
                    rect.bottom <= bounds.bottom + 1,
                ) &&
                getComputedStyle(element).textOverflow !== 'ellipsis'
              );
            }),
          { message: 'all 120 title characters paint within the complete content heading' },
        )
        .toBe(true);
    }
    await screenShots(page, `material-title-${key}-long`);
    await expect(
      page.getByRole('button', { name: `„${LONG_TITLE}“ umbenennen`, exact: true }),
    ).toBeVisible();
  });
}
