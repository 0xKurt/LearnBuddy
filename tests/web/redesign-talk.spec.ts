import { writeFileSync } from 'node:fs';
import { planTest, sendWorksheet } from './coreLoop';
import { expect, test } from '@playwright/test';
import { onboardChild, startOffer } from './figureWalk';
import { PHONES, shot } from './fit';
import { REPLY, sayOneThing, voiceAsSilence } from './talk';
import { SCREEN_LOOKS, screenLook, screenTargets } from './redesign-screen-matrix';
test.use({ actionTimeout: 20_000 });
for (const look of SCREEN_LOOKS)
  for (const phone of PHONES) {
    test(`Talk and practice voice: ${look.family} ${look.dark ? 'dark' : 'light'} ${phone.width}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(phone);
      await onboardChild(page, 'talk-redesign');
      const key = await screenLook(page, look);
      // Reuse the existing silent-audio speech harness; API/PG and microphone remain real.
      await voiceAsSilence(page, 15_000);
      await page.getByRole('button', { name: 'Mit Buddy sprechen' }).click();
      await expect(page.getByText('Ich höre zu.')).toBeVisible();
      await screenTargets(page);
      await shot(page, `talk-${key}-${phone.width}-listening`, { phones: [phone] });
      await sayOneThing(page, false);
      await expect(page.getByText(REPLY).last()).toBeVisible();
      await expect(page.getByText('Buddy spricht …')).toBeVisible();
      await screenTargets(page);
      const controls = await Promise.all(
        ['Tastatur', 'Unterbrechen und sprechen', 'Foto zeigen'].map((name) =>
          (name === 'Unterbrechen und sprechen'
            ? page.getByRole('button', { name, exact: true }).filter({ hasText: 'Unterbrechen' })
            : page.getByRole('button', { name, exact: true })
          )
            .filter({ visible: true })
            .boundingBox(),
        ),
      );
      expect(controls.every(Boolean)).toBe(true);
      const [keyboard, primary, camera] = controls;
      expect(
        keyboard!.x + keyboard!.width,
        'keyboard and speaking pill do not overlap',
      ).toBeLessThanOrEqual(primary!.x);
      expect(
        primary!.x + primary!.width,
        'speaking pill and camera do not overlap',
      ).toBeLessThanOrEqual(camera!.x);
      await shot(page, `talk-${key}-${phone.width}-speaking`, { phones: [phone] });
      await page.getByRole('button', { name: 'Unterbrechen und sprechen' }).first().click();
      await expect(page.getByRole('button', { name: 'Aufnahme stoppen' })).toBeVisible();
      await page.getByRole('button', { name: 'Beenden', exact: true }).click();
      await expect(page.getByText('LearnBuddy', { exact: true })).toBeVisible();
      await page.unroute('**/v1/voice/speech');
      await voiceAsSilence(page, 600);
      await startOffer(
        page,
        'Ich will Brüche vergleichen üben',
        'ein paar Fragen zu Brüchen vorbereitet',
      );
      await expect(
        page.getByRole('heading', { name: 'Brüche vergleichen', exact: true }),
      ).toBeVisible();
      const talkTrigger = page
        .getByRole('button', { name: 'Mit Buddy sprechen', exact: true })
        .filter({ visible: true });
      await expect(talkTrigger).toHaveCount(1);
      await talkTrigger.click();
      await expect(page.getByRole('button', { name: 'Aufnahme stoppen' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Deine Frage zur Aufgabe' })).toHaveCount(0);
      await screenTargets(page);
      await shot(page, `talk-${key}-${phone.width}-practice-voice`, { phones: [phone] });
      await page.getByRole('button', { name: 'Tastatur' }).last().click();
      await expect(page.getByRole('textbox', { name: 'Deine Frage zur Aufgabe' })).toBeVisible();
      await expect(
        page.getByRole('switch', { name: 'Vorlesen', exact: true }).last(),
      ).not.toBeChecked();
      await page.unroute('**/v1/voice/speech');
    });
  }

for (const sample of [
  { phone: PHONES[1], look: SCREEN_LOOKS[0] },
  { phone: PHONES[0], look: SCREEN_LOOKS[3] },
]) {
  test(`Talk genuine long card and live control: ${sample.phone.width}`, async ({ page }) => {
    await page.setViewportSize(sample.phone);
    await onboardChild(page, 'talk-long');
    const key = await screenLook(page, sample.look);
    await planTest(page);
    await sendWorksheet(page);
    await page.getByLabel('Schreib Buddy …').fill('Ich will Brüche vergleichen üben');
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(
      page.getByText('ein paar Fragen zu Brüchen vorbereitet', { exact: false }).last(),
    ).toBeVisible();
    await voiceAsSilence(page, 600);
    await page
      .getByRole('button', { name: 'Mit Buddy sprechen', exact: true })
      .filter({ visible: true })
      .click();
    await expect(page.getByText('Ich höre zu.', { exact: true })).toBeVisible();
    const tail = page.locator('[data-testid="scroll-talk"]:visible');
    const ready = tail.getByRole('button', { name: "Los geht's", exact: true });
    await expect(ready).toBeVisible();
    await screenTargets(page);
    await shot(page, `talk-${key}-${sample.phone.width}-long-card`, { phones: [sample.phone] });
    await test.info().attach('actual-tail-size', {
      body: JSON.stringify(
        await tail.evaluate((element) => ({
          viewport: element.clientHeight,
          content: element.scrollHeight,
          offset: element.scrollTop,
          overflow: Math.max(0, element.scrollHeight - element.clientHeight),
        })),
      ),
      contentType: 'application/json',
    });
    writeFileSync(
      test.info().outputPath('tail-size.json'),
      JSON.stringify(
        await tail.evaluate((element) => ({
          viewport: element.clientHeight,
          content: element.scrollHeight,
          offset: element.scrollTop,
          overflow: Math.max(0, element.scrollHeight - element.clientHeight),
        })),
        null,
        2,
      ),
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const camera = page.getByRole('button', { name: 'Foto zeigen', exact: true });
    const paint = camera.locator(':scope > div').first();
    const rect = await camera.boundingBox();
    expect(rect).not.toBeNull();
    await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2);
    await page.mouse.down();
    await expect
      .poll(() =>
        paint.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a),
      )
      .toBeLessThan(1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() =>
        paint.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a),
      )
      .toBe(1);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await ready.click();
    await expect(
      page.getByRole('heading', { name: 'Brüche vergleichen', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Tastatur', exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Deine Frage zur Aufgabe', exact: true }),
    ).toHaveCount(0);
  });
}
