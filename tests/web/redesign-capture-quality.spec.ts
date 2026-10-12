// Prepared against real dev-stack scenarios; execute only after ordered integration.
import { expect, test, type Locator } from '@playwright/test';
import { MAX_PHOTOS } from '../../apps/mobile/lib/capture/pages';
import captureDe from '../../apps/mobile/locales/de/capture.json';
import { UI } from '../../apps/mobile/lib/theme/components';
import { PHONES, shot, overflows } from './fit';
import { writeFileSync } from 'node:fs';
import { freshEmail, planTest, signUpMia, worksheetJpeg } from './coreLoop';
import { join } from 'node:path';
import { SCREEN_LOOKS, screenLook, screenShots, screenTargets } from './redesign-screen-matrix';

for (const look of SCREEN_LOOKS) {
  const { family, dark } = look;
  test(`capture quality · ${family} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
    await signUpMia(page, freshEmail('capture'));
    await screenLook(page, look);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const key = dark ? `${family}Dark` : family;
    await planTest(page);
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Foto machen', exact: true }).click();
    await (
      await chooser
    ).setFiles(join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures/blur.jpg'));
    await expect(page.getByText('Foto 1 ist unscharf.', { exact: true })).toBeVisible();
    await screenShots(page, `capture-secondary-${key}-quality`);
    const retake = page.getByRole('button', { name: 'Neu fotografieren', exact: true });
    const keep = page.getByRole('button', { name: 'Trotzdem behalten', exact: true });
    await expect(retake).toBeEnabled();
    await expect(keep).toBeEnabled();
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      for (const text of [
        page.getByRole('heading', { name: 'Foto 1 ist unscharf.', exact: true }),
        page.getByText(captureDe.quality.blurry_tip, { exact: true }),
      ]) {
        await text.scrollIntoViewIfNeeded();
        await whole(text, false);
      }
      for (const [name, control] of [
        ['retake', retake],
        ['keep', keep],
      ] as const) {
        await control.scrollIntoViewIfNeeded();
        await whole(control);
        await shot(page, `capture-${key}-quality-${name}-${phone.width}`, { phones: [phone] });
      }
    }
    await page.getByRole('button', { name: 'Trotzdem behalten', exact: true }).click();
    const nextChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Noch ein Foto', exact: true }).click();
    await (await nextChooser).setFiles(await worksheetJpeg(page));
    const tiles = page.getByTestId('attach-tile');
    await expect(tiles).toHaveCount(2);
    await expect(tiles.nth(0).getByText('1', { exact: true })).toBeVisible();
    await expect(tiles.nth(1).getByText('2', { exact: true })).toBeVisible();
    const remainingSource = await tiles.nth(1).locator('img').getAttribute('src');
    await screenShots(page, `capture-secondary-${key}-pages`);
    await page.getByRole('button', { name: 'Foto 1 entfernen', exact: true }).click();
    await expect(tiles).toHaveCount(1);
    await expect(tiles.getByText('1', { exact: true })).toBeVisible();
    await expect(tiles.getByText('2', { exact: true })).toHaveCount(0);
    await expect(tiles.locator('img')).toHaveAttribute('src', remainingSource!);
    await expect(page.getByRole('button', { name: 'Foto 1 entfernen', exact: true })).toBeVisible();
  });
}

// Pages are browsed inside their own viewport; the root and input controls never scroll.
async function whole(control: Locator, target = true) {
  const measured = await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    let left = Math.max(0, box.left),
      right = Math.min(innerWidth, box.right);
    let top = Math.max(0, box.top),
      bottom = Math.min(innerHeight, box.bottom);
    for (let node = element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node),
        bounds = node.getBoundingClientRect();
      if (/(hidden|scroll|auto)/.test(style.overflowX)) {
        left = Math.max(left, bounds.left);
        right = Math.min(right, bounds.right);
      }
      if (/(hidden|scroll|auto)/.test(style.overflowY)) {
        top = Math.max(top, bounds.top);
        bottom = Math.min(bottom, bounds.bottom);
      }
    }
    return {
      name: element.getAttribute('aria-label'),
      width: box.width,
      height: box.height,
      shownWidth: Math.max(0, right - left),
      shownHeight: Math.max(0, bottom - top),
    };
  });
  if (target) {
    expect(measured.width, measured.name ?? 'control width').toBeGreaterThanOrEqual(44);
    expect(measured.height, measured.name ?? 'control height').toBeGreaterThanOrEqual(44);
  }
  expect(measured.shownWidth, measured.name ?? 'horizontal clipping').toBeGreaterThanOrEqual(
    measured.width - 0.5,
  );
  expect(measured.shownHeight, measured.name ?? 'vertical clipping').toBeGreaterThanOrEqual(
    measured.height - 0.5,
  );
  return measured;
}
for (const look of SCREEN_LOOKS)
  test(`Capture supported maximum pages: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize(PHONES[1]);
    await signUpMia(page, freshEmail('capture-max'));
    const key = await screenLook(page, look);
    await page.getByRole('button', { name: 'Was möchtest du anhängen?', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /Aus Dateien/ }).click();
    const source = await chooser;
    expect(source.isMultiple()).toBe(true);
    await source.setFiles(Array(MAX_PHOTOS).fill(await worksheetJpeg(page)));
    const tiles = page.getByTestId('attach-tile');
    await expect(tiles).toHaveCount(MAX_PHOTOS);
    const originals = await tiles
      .locator('img')
      .evaluateAll((images) => images.map((image) => image.getAttribute('src')));
    const composer = page.getByTestId('composer');
    const send = composer.getByRole('button', { name: 'Senden', exact: true });
    const field = composer.getByRole('textbox', { name: 'Schreib Buddy …', exact: true });
    const mic = composer.getByRole('button', { name: 'Nachricht sprechen', exact: true });
    await expect(send).toBeEnabled();
    const proof = [];
    for (const phone of [...PHONES].reverse()) {
      for (const keyboard of [false, true]) {
        const size = { width: phone.width, height: phone.height - (keyboard ? 300 : 0) };
        await page.setViewportSize(size);
        if (keyboard) await field.focus();
        else await field.blur();
        if (keyboard && phone.width === 360) {
          // Existing learner test input, long enough to reach the real five-row cap.
          const emptyHeight = (await field.boundingBox())!.height;
          const caption = Array(UI.field.maxRows + 1)
            .fill('Ich schreibe am Freitag eine Mathearbeit über Brüche.')
            .join('\n');
          await field.fill(caption);
          await expect(field).toHaveValue(caption);
          await expect
            .poll(
              () =>
                field.evaluate((input) =>
                  Math.abs(
                    input.clientHeight - Number.parseFloat(getComputedStyle(input).maxHeight),
                  ),
                ),
              {
                message: 'real caption reaches the existing maximum text height',
              },
            )
            .toBeLessThanOrEqual(1);
          writeFileSync(
            testInfo.outputPath(`caption-${key}-${phone.width}.json`),
            JSON.stringify(
              {
                caption,
                emptyHeight,
                composer: await composer.boundingBox(),
                field: await field.boundingBox(),
                input: await field.evaluate((input) => ({
                  clientHeight: input.clientHeight,
                  scrollHeight: input.scrollHeight,
                  maxHeight: getComputedStyle(input).maxHeight,
                })),
                viewport: page.viewportSize(),
              },
              null,
              2,
            ),
          );
          expect((await field.boundingBox())!.height).toBeGreaterThan(emptyHeight);
          expect(
            await field.evaluate((input) => input.scrollHeight > input.clientHeight),
            'the actual longer caption scrolls inside the capped editable field',
          ).toBe(true);
          const limit = Number(await field.getAttribute('maxlength'));
          expect(Number.isFinite(limit) && limit > caption.length).toBe(true);
          const fullCaption = caption.repeat(Math.ceil(limit / caption.length)).slice(0, limit);
          await field.fill(fullCaption);
          await expect(field).toHaveValue(fullCaption);
          const count = composer.getByText('Das Feld ist voll — schick das erst mal ab.', {
            exact: true,
          });
          await expect(count).toBeVisible();
          writeFileSync(
            testInfo.outputPath(`near-limit-${key}-${phone.width}.json`),
            JSON.stringify(
              {
                limit,
                length: fullCaption.length,
                composer: await composer.boundingBox(),
                field: await field.boundingBox(),
                count: await count.boundingBox(),
                viewport: page.viewportSize(),
              },
              null,
              2,
            ),
          );
          // Start through the genuine microphone control in full room, then inspect
          // the real recording status with the keyboard viewport restored.
          await page.setViewportSize(PHONES[1]);
          await mic.click();
          await expect(
            composer.getByRole('button', { name: 'Aufnahme stoppen', exact: true }),
          ).toBeVisible();
          const status = composer.getByText(/^Ich höre zu …/);
          await expect(status).toBeVisible();
          await page.setViewportSize(size);
          await field.focus();
          writeFileSync(
            testInfo.outputPath(`recording-${key}-${phone.width}.json`),
            JSON.stringify(
              {
                composer: await composer.boundingBox(),
                field: await field.boundingBox(),
                count: await count.boundingBox(),
                status: await status.boundingBox(),
                statusRow: await status.evaluate((text) => {
                  const box = text.parentElement!.getBoundingClientRect();
                  return { top: box.top, bottom: box.bottom, height: box.height };
                }),
                viewport: page.viewportSize(),
              },
              null,
              2,
            ),
          );
          await expect(status).toContainText(/0:0[1-9]/);
          await status.scrollIntoViewIfNeeded();
          await whole(status, false);
          const recordingBox = (await composer.boundingBox())!;
          expect(recordingBox.y + recordingBox.height).toBeLessThanOrEqual(size.height + 0.5);
          await shot(page, `capture-max-${key}-360-recording`, { phones: [size] });
          await count.scrollIntoViewIfNeeded();
          await whole(count, false);
          const stop = composer.getByRole('button', { name: 'Aufnahme stoppen', exact: true });
          await whole(stop);
          const transcribed = page.waitForResponse((response) =>
            response.url().endsWith('/v1/voice/transcribe'),
          );
          await stop.click();
          expect((await transcribed).ok()).toBe(true);
          await expect(mic).toBeVisible();
          await expect(status).toHaveCount(0);
          await expect(field).toHaveValue(fullCaption);
        }
        await expect
          .poll(
            async () => {
              const box = await composer.boundingBox();
              return box !== null && box.y >= 0 && box.y + box.height <= size.height + 0.5;
            },
            { message: 'pinned Composer including pages stays inside viewport' },
          )
          .toBe(true);
        const hello = page.getByRole('heading', { name: /Hallo Mia\./ });
        if (keyboard) {
          await expect(hello).toHaveCount(0);
          await expect(
            page.getByRole('button', { name: 'Foto vom Arbeitsblatt', exact: true }),
          ).toHaveCount(0);
        } else {
          await expect(hello).toBeVisible();
          for (const name of [
            'Ich schreibe bald eine Arbeit',
            'Foto vom Arbeitsblatt',
            'Einfach mal üben',
          ])
            await whole(page.getByRole('button', { name, exact: true }));
        }
        const pinned = await send.boundingBox();
        await whole(send);
        await whole(field);
        await whole(mic);
        for (let index = 1; index <= MAX_PHOTOS; index++) {
          const photo = composer.getByRole('button', {
            name: `Foto ${index} von ${MAX_PHOTOS}`,
            exact: true,
          });
          await photo.scrollIntoViewIfNeeded();
          proof.push({ phone: phone.width, keyboard, index, photo: await whole(photo) });
          const remove = composer.getByRole('button', {
            name: `Foto ${index} entfernen`,
            exact: true,
          });
          await remove.scrollIntoViewIfNeeded();
          proof.push({ phone: phone.width, keyboard, index, remove: await whole(remove) });
        }
        await whole(send);
        await whole(field);
        await whole(mic);
        const after = await send.boundingBox();
        expect(after!.y, 'browsing pages never moves pinned Send').toBeCloseTo(pinned!.y, 1);
        expect(
          await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0),
          'no root page scroll',
        ).toBe(0);
        const overflow = await overflows(page);
        if (keyboard && phone.width === 360) {
          const editable = overflow.find((entry) => entry.label === 'Schreib Buddy …');
          expect(
            editable,
            'only the whole capped Composer textarea permits editable overflow',
          ).toMatchObject({ allowed: true });
          expect(editable!.overflow).toBeGreaterThan(0);
        }
        const background = await page
          .locator('svg[viewBox="0 0 100 100"][preserveAspectRatio="none"]')
          .filter({ visible: true })
          .evaluateAll((svgs) =>
            svgs.map((svg) => {
              const parent = svg.parentElement!;
              const box = parent.getBoundingClientRect();
              return {
                top: box.top,
                bottom: box.bottom,
                height: box.height,
                position: getComputedStyle(parent).position,
              };
            }),
          );
        writeFileSync(
          testInfo.outputPath(`root-${phone.width}-${keyboard ? 'keyboard' : 'full'}.json`),
          JSON.stringify(
            {
              background,
              overflow,
              document: await page.evaluate(() => ({
                height: document.documentElement.clientHeight,
                scrollHeight: document.scrollingElement?.scrollHeight,
              })),
            },
            null,
            2,
          ),
        );
        await screenTargets(page);
        await shot(page, `capture-max-${key}-${phone.width}-${keyboard ? 'keyboard' : 'full'}`, {
          phones: [size],
        });
        if (keyboard && phone.width === 360) {
          await field.fill('');
          await expect(field).toHaveValue('');
          await whole(send);
          await whole(field);
          await whole(mic);
        }
      }
    }
    await page.setViewportSize(PHONES[0]);
    await field.blur();
    const last = composer.getByRole('button', {
      name: `Foto ${MAX_PHOTOS} von ${MAX_PHOTOS}`,
      exact: true,
    });
    await last.scrollIntoViewIfNeeded();
    await last.click();
    const viewer = page.locator('[aria-modal="true"]');
    await expect(
      viewer
        .locator('img')
        .and(
          viewer.getByRole('img', { name: `Foto ${MAX_PHOTOS} von ${MAX_PHOTOS}`, exact: true }),
        ),
    ).toHaveAttribute('src', originals.at(-1)!);
    await viewer.getByRole('button', { name: 'Schließen', exact: true }).click();
    const remove = composer.getByRole('button', { name: 'Foto 7 entfernen', exact: true });
    await remove.scrollIntoViewIfNeeded();
    await remove.click();
    await expect(tiles).toHaveCount(MAX_PHOTOS - 1);
    expect(
      await tiles
        .locator('img')
        .evaluateAll((images) => images.map((image) => image.getAttribute('src'))),
    ).toEqual(originals.filter((_, index) => index !== 6));
    await expect(tiles.nth(6).getByText('7', { exact: true })).toBeVisible();
    await expect(
      composer.getByRole('button', { name: 'Foto 20 entfernen', exact: true }),
    ).toHaveCount(0);
    await whole(send);
    await page.setViewportSize(PHONES[1]);
    await field.blur();
    // Clear genuine selected sources; the ordinary intro and its actions return unchanged.
    for (let remaining = MAX_PHOTOS - 1; remaining > 0; remaining--) {
      const firstRemove = composer.getByRole('button', { name: 'Foto 1 entfernen', exact: true });
      await firstRemove.scrollIntoViewIfNeeded();
      await firstRemove.click();
      await expect(tiles).toHaveCount(remaining - 1);
    }
    await expect(composer.getByTestId('scroll-list')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Hallo Mia\./ })).toBeVisible();
    for (const name of [
      'Ich schreibe bald eine Arbeit',
      'Foto vom Arbeitsblatt',
      'Einfach mal üben',
    ])
      await whole(page.getByRole('button', { name, exact: true }));
    await whole(field);
    await whole(mic);
    await expect(send).toHaveCount(0);
    const talk = composer.getByRole('button', { name: 'Mit Buddy sprechen', exact: true });
    await expect(talk).toBeEnabled();
    await whole(talk);
    await shot(page, `capture-max-${key}-cleared`, { phones: PHONES });
    writeFileSync(testInfo.outputPath('maximum-reachability.json'), JSON.stringify(proof, null, 2));
  });
