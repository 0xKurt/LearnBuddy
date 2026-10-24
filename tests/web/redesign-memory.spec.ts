import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia, askShorter, openMenu } from './coreLoop';
import { shot } from './fit';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
import apiDe from '../../apps/api/src/i18n/de.json';
import { DISTRESS_TEXT } from '../../apps/api/src/testing/scenarios/safeguarding';
import { expectSeen } from './seen';

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
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
    const form = page.getByTestId('scroll-form');
    await expect(form.getByRole('button', { name: 'Speichern', exact: true })).toHaveCount(0);
    await input.fill(DISTRESS_TEXT);
    await screenShots(page, `redesign-memory-${appearance}-before-help`);
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    const help = page.locator('[aria-modal="true"]');
    const reply = help.getByText(apiDe.safeguarding.concern, { exact: true });
    await expectSeen(reply);
    await expect(reply).toBeInViewport({ ratio: 1 });
    await expect(page.getByText('Geändert.', { exact: true })).toHaveCount(0);
    await screenShots(page, `redesign-memory-${appearance}-help`, true);
    await help.getByRole('button', { name: 'Schließen', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Möchte kurze Übungen/ })).toBeVisible();
    await expect(page.getByText(DISTRESS_TEXT, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: /^Möchte kurze Übungen/ }).click();
    await page
      .locator('[aria-modal="true"]')
      .getByRole('button', { name: 'Ändern: Möchte kurze Übungen', exact: true })
      .click();
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
    // Hence one `shot` and not the four of `screenShots`.
    await row.click();
    await page
      .locator('[aria-modal="true"]')
      .getByRole('button', { name: 'Entfernen: Möchte kurze Übungen mit Pausen', exact: true })
      .click();
    await expect(row).toHaveCount(0);
    const undo = page.getByRole('button', { name: 'Rückgängig', exact: true });
    await expect(undo).toBeVisible();
    // The only way back from a removal: a real 44 pt target on the web too, where `hitSlop`
    // does nothing (components/lb/Toast.tsx, #599 — it was 81 × 21).
    const target = await undo.boundingBox();
    expect(target?.width ?? 0, 'the toast’s offer is at least 44 wide').toBeGreaterThanOrEqual(44);
    expect(target?.height ?? 0, 'the toast’s offer is at least 44 high').toBeGreaterThanOrEqual(44);
    await shot(page, `redesign-memory-${appearance}-removed`);
  });
}
