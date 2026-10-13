import {
  CreateMaterialRequest,
  CreateMaterialResponse,
  MaterialItemsView,
  MaterialView,
} from '../../packages/shared-types/src/contracts/index';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import { expect, test } from '@playwright/test';
import {
  freshEmail,
  openMenu,
  planTest,
  sendWorksheet,
  signUpMia,
  worksheetJpeg,
} from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
for (const look of SCREEN_LOOKS)
  test(`Material detail: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(240_000);
    await signUpMia(page, freshEmail('material-detail'));
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
    await expect(
      page.getByRole('heading', { name: 'Brüche kürzen und vergleichen', exact: true }),
    ).toBeVisible();
    const palette = paletteOf(themeNameOf(look.family, look.dark));
    const heading = page.getByRole('heading', {
      name: 'Brüche kürzen und vergleichen',
      exact: true,
    });
    const ink = Number.parseInt(palette.ink.slice(1), 16);
    await expect(heading).toHaveCSS(
      'color',
      `rgb(${ink >> 16}, ${(ink >> 8) & 255}, ${ink & 255})`,
    );
    await expect(heading).toHaveCSS('font-family', /Figtree/);
    const path = page.url();
    await expect(page.getByText(/^Welcher Bruch ist größer:/).first()).toBeVisible();
    // ui_kits/app/Extra.jsx:108–116: the sheet's name and "Mathe · 1 Seite" in the head, its
    // page pinned under it, and beside that the way into practising it.
    await expect(page.getByText('Mathe · 1 Seite', { exact: true })).toBeVisible();
    const practise = page.getByRole('button', {
      name: '„Brüche kürzen und vergleichen“ üben',
      exact: true,
    });
    await expect(practise).toHaveText('Daraus üben');
    // At the end of the pinned row, 12 from the edge (Extra.jsx:113,115).
    const practiseBox = (await practise.boundingBox())!;
    expect(Math.round(practiseBox.x + practiseBox.width)).toBe(page.viewportSize()!.width - 12);
    // Deleting is never a button in the card (implementation/MIGRATION.md §5).
    await expect(page.getByRole('button', { name: /^Frage [0-9]+ löschen$/ })).toHaveCount(0);
    await screenShots(page, `material-${key}`);
    // Renaming is the sheet's own action in the head's ⋯ (#599).
    await page.getByRole('button', { name: 'Mehr', exact: true }).click();
    await page.getByRole('button', { name: /umbenennen$/i }).click();
    await page.getByLabel('Name des Blatts').fill('Brüche – Test Freitag');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Brüche – Test Freitag', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Brüche – Test Freitag', exact: true }),
    ).toBeVisible();
    // A question's ⋯ opens its sheet; deleting asks once more in the same sheet.
    const menus = page.getByRole('button', { name: /^Mehr zu Frage [0-9]+$/ });
    await page.getByRole('button', { name: 'Mehr zu Frage 1', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Frage 1', exact: true })).toBeVisible();
    await screenShots(page, `material-${key}-question-sheet`, true);
    await page.getByRole('button', { name: 'Frage 1 löschen', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Frage löschen?', exact: true })).toBeVisible();
    await screenShots(page, `material-${key}-question-delete`, true);
    await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(menus).toHaveCount(4);
    for (let remaining = 4; remaining > 0; remaining--) {
      await page.getByRole('button', { name: 'Mehr zu Frage 1', exact: true }).click();
      await page.getByRole('button', { name: 'Frage 1 löschen', exact: true }).click();
      await page.getByRole('button', { name: 'Löschen', exact: true }).click();
      await expect(menus).toHaveCount(remaining - 1);
    }
    await expect(practise).toHaveCount(0);
    await expect(page.getByText('Hier sind keine Fragen mehr', { exact: true })).toBeVisible();
    await screenShots(page, `material-${key}-empty`);
    await page.getByRole('button', { name: 'Seite hinzufügen', exact: true }).click();
    await expect(page.getByText(/^Die Fragen dazu kommen zu diesem Blatt\./)).toBeVisible();
    await screenShots(page, `material-${key}-add-page`, true);
    const materialId = new URL(path).pathname.split('/').at(-1)!;
    const photo = await worksheetJpeg(page);
    const created = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/v1/materials' &&
        response.request().method() === 'POST',
    );
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Aus der Galerie', exact: true }).click();
    await (await chooser).setFiles(photo);
    await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
    const creation = await created;
    expect(creation.ok()).toBe(true);
    const request = CreateMaterialRequest.parse(creation.request().postDataJSON());
    expect(request).toMatchObject({
      completes: materialId,
      purpose: 'study',
      photo_mimes: ['image/jpeg'],
      sending: false,
    });
    expect(request.client_request_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(request.goal_id).toBeUndefined();
    expect(request.step_id).toBeUndefined();
    expect(Object.keys(creation.request().postDataJSON()).sort()).toEqual([
      'client_request_id',
      'completes',
      'photo_mimes',
      'purpose',
      'sending',
    ]);
    const reserved = CreateMaterialResponse.parse(await creation.json());
    expect(reserved.material.id).not.toBe(materialId);
    const submitted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/v1/materials/${reserved.material.id}/submit` &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    const submission = await submitted;
    expect(submission.ok()).toBe(true);
    expect(MaterialView.parse(await submission.json()).id).toBe(reserved.material.id);
    const items = page.waitForResponse(async (response) => {
      if (
        new URL(response.url()).pathname !== `/v1/materials/${materialId}/items` ||
        response.request().method() !== 'GET' ||
        !response.ok()
      )
        return false;
      return MaterialItemsView.parse(await response.json()).items.length > 0;
    });
    await page.goto(path);
    const returned = MaterialItemsView.parse(await (await items).json());
    expect(returned.material.id).toBe(materialId);
    expect(returned.items.length).toBeGreaterThan(0);
    await expect(menus).toHaveCount(returned.items.length);
    await expect(page.getByText(/^Welcher Bruch ist größer:/).first()).toBeVisible();
    await screenShots(page, `material-${key}-page-added`);
  });
