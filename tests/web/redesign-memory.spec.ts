import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia, askShorter, openMenu } from './coreLoop';
import { shot } from './fit';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

for (const look of SCREEN_LOOKS) {
  test(`redesign Memory ${look.family} ${look.dark ? 'dark' : 'light'}: edit persistence, remove and undo`, async ({
    page,
  }) => {
    test.setTimeout(360_000);
    await signUpMia(page, freshEmail('redesign-memory'));
    const appearance = await screenLook(page, look);
    await openMenu(page, 'Was Buddy über dich weiß');
    // ui_kits/app/More.jsx:37: nothing kept is one quiet line in the page, no state of its own.
    await expect(page.getByRole('heading', { name: 'Noch nichts gemerkt' })).toHaveCount(0);
    const quiet = page.getByText(
      'Erzähl Buddy einfach, was bei dir ansteht. Was er sich merkt, steht dann hier.',
      { exact: true },
    );
    await expect(quiet).toBeVisible();
    await expect(quiet).toHaveCSS('font-size', '16px');
    await expect(quiet).not.toHaveCSS('text-align', 'center');
    await screenShots(page, `redesign-memory-${appearance}-empty`);
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await askShorter(page);
    await openMenu(page, 'Was Buddy über dich weiß');
    await screenShots(page, `redesign-memory-${appearance}-notes`);
    await page.getByRole('button', { name: /^Möchte kurze Übungen/ }).click();
    let sheet = page.locator('[aria-modal="true"]');
    // ui_kits/app/More.jsx:39–44: the sheet carries the thing itself; two actions, no chevrons.
    await expect(
      sheet.getByRole('heading', { name: 'Möchte kurze Übungen', exact: true }),
    ).toBeVisible();
    await expect(sheet.getByRole('heading', { name: 'Ändern', exact: true })).toHaveCount(0);
    for (const name of ['Ändern: Möchte kurze Übungen', 'Entfernen: Möchte kurze Übungen'])
      await expect(sheet.getByRole('button', { name, exact: true }).locator('svg')).toHaveCount(1);
    await screenShots(page, `redesign-memory-${appearance}-actions`, true);
    await sheet.getByRole('button', { name: 'Ändern: Möchte kurze Übungen', exact: true }).click();
    const input = page.getByLabel('Was Buddy sich merken soll');
    await expect(input).toBeVisible();
    await input.fill('Möchte kurze Übungen mit Pausen');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page.getByText('Geändert.', { exact: true })).toBeVisible();
    await page.reload();
    const row = page.getByRole('button', { name: /^Möchte kurze Übungen mit Pausen/ });
    await expect(row).toBeVisible();
    await row.click();
    sheet = page.locator('[aria-modal="true"]');
    await sheet
      .getByRole('button', { name: 'Entfernen: Möchte kurze Übungen mit Pausen', exact: true })
      .click();
    // Removed at once from its sheet (More.jsx:42), with the way back in the toast — no
    // question in between (docs/UX-PRINCIPLES.md: undo over confirmation).
    await expect(row).toHaveCount(0);
    await expect(page.getByText('Das entfernen?', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Entfernt. Buddy vergisst das.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rückgängig', exact: true }).click();
    await expect(row).toBeVisible();
    await page.reload();
    await expect(row).toBeVisible();
    // The image of the removal comes last and nothing follows it: the toast stays 9 s, and two
    // screenshots inside that window made the undo above a race (seen once under load).
    // `shot`, not `screenShots`: the toast's "Rückgängig" is 81×21 on the web, under the 44 pt
    // the matrix demands (components/lb/Toast.tsx, outside this area — reported on #599).
    await row.click();
    await page
      .locator('[aria-modal="true"]')
      .getByRole('button', { name: 'Entfernen: Möchte kurze Übungen mit Pausen', exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rückgängig', exact: true })).toBeVisible();
    await shot(page, `redesign-memory-${appearance}-removed`);
  });
}
