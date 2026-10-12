import errors from '../../apps/mobile/locales/de/errors.json';
import { CreateMaterialResponse, SendMessageResponse } from '@learnbuddy/shared-types/contracts';
import { PHONES } from './fit';
import { TOUCH } from '../../apps/mobile/lib/theme/space';
import { expect, test, type Response } from '@playwright/test';
import { freshEmail, planTest, sendWorksheet, signUpMia } from './coreLoop';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';
async function messageResult(response: Response) {
  const stream = await response.text();
  const done = stream.split(/\r?\n\r?\n/).find((event) => event.startsWith('event: done'));
  expect(done).toBeDefined();
  return SendMessageResponse.parse(
    JSON.parse(
      done!
        .split(/\r?\n/)
        .find((line) => line.startsWith('data: '))!
        .slice(6),
    ),
  );
}
for (const look of SCREEN_LOOKS)
  test(`Chat cards/undo: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(240_000);
    await signUpMia(page, freshEmail('chat-redesign'));
    const key = await screenLook(page, look);
    await page.getByLabel('Schreib Buddy …').fill('Ich spiele Handball');
    const firstReply = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/v1/buddy/messages',
    );
    await page.getByRole('button', { name: 'Senden' }).click();
    const firstResult = await messageResult(await firstReply);
    const actions = firstResult.home.thread
      .flatMap((message) => message.actions)
      .filter((action) => action.undoable && action.status !== 'undone');
    expect(actions).toHaveLength(1);
    const actionId = actions[0]!.id;
    await expect(page.getByText('Cool – Handball merke ich mir.')).toBeVisible();
    const trigger = page.getByRole('button', { name: 'Zurücknehmen', exact: true });
    await expect(trigger).toHaveCount(1);
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Was du zurücknehmen kannst', exact: true }),
    ).toBeVisible();
    const undo = page.getByRole('button', { name: /^Rückgängig: / });
    await expect(undo).toHaveCount(1);
    await screenShots(page, `chat-${key}-undo-sheet`);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    const undoPath = `/v1/buddy/actions/${actionId}/undo`;
    await page.route(`**${undoPath}`, async (route) => {
      requests++;
      if (requests === 1) {
        await route.abort('failed');
        return;
      }
      await held;
      await route.continue();
    });
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === undoPath && r.request().method() === 'POST',
    );
    try {
      await undo.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByText(errors.code.network, { exact: true })).toBeVisible();
      await expect(undo).not.toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByText('Zurückgenommen', { exact: true })).toHaveCount(0);
      await screenShots(page, `chat-${key}-undo-error`);
      await undo.focus();
      await page.keyboard.press('Enter');
      await expect(undo).toHaveAttribute('aria-busy', 'true');
      await expect(undo).toHaveAttribute('aria-disabled', 'true');
      await page.keyboard.press('Enter');
      expect(requests).toBe(2);
      await expect(page.getByText(errors.code.network, { exact: true })).toHaveCount(0);
      await screenShots(page, `chat-${key}-undo-busy`);
      release();
      expect((await response).status()).toBe(200);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'wait' });
    }
    await expect(page.getByText('Gemerkt: Spielt Handball – rückgängig gemacht')).toBeVisible();
    await expect(undo).toHaveCount(0);
    await expect(page.getByText('Zurückgenommen', { exact: true })).toBeVisible();
    await screenShots(page, `chat-${key}-undone-sheet`);
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await screenShots(page, `chat-${key}-receipt`);
    await planTest(page);
    await expect(page.getByText('Schick mir ein Foto')).toBeVisible();
    await screenShots(page, `chat-${key}-capture-card`);
    const created = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        new URL(r.url()).pathname === '/v1/materials' &&
        r.status() === 201,
    );
    await sendWorksheet(page);
    const materialId = CreateMaterialResponse.parse(await (await created).json()).material.id;
    await expect(
      page.getByText('Aus deinem Arbeitsblatt habe ich eine kurze Übung gemacht.'),
    ).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Jetzt üben' })).toBeInViewport();
    await screenShots(page, `chat-${key}-ready-card`);
    await page.getByLabel('Schreib Buddy …').fill('Ich will mit dem Arbeitsblatt Brüche üben');
    const scoped = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/v1/buddy/messages',
    );
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    const result = await messageResult(await scoped);
    expect(result.status).toBe('done');
    expect(result.home.focus?.material_id).toBe(materialId);
    await page.getByRole('button', { name: 'Karte ausblenden', exact: true }).click();
    const materialFocus = page.getByRole('button', { name: /^Du arbeitest gerade an:/ });
    await expect(materialFocus).toHaveCount(1);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await expect(materialFocus).toBeInViewport();
      const target = await materialFocus.boundingBox();
      expect(target).not.toBeNull();
      expect(target!.width).toBeGreaterThanOrEqual(TOUCH);
      expect(target!.height).toBeGreaterThanOrEqual(TOUCH);
    }
    await materialFocus.click();
    await expect(page).toHaveURL(new RegExp(`/material/${materialId}$`));
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await page.getByLabel('Schreib Buddy …').fill('Ich will Brüche vergleichen üben');
    await page.getByRole('button', { name: 'Senden' }).click();
    await expect(
      page.getByText('ein paar Fragen zu Brüchen vorbereitet', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: "Los geht's", exact: true }).last(),
    ).toBeVisible();
    await screenShots(page, `chat-${key}-offer`);
  });
