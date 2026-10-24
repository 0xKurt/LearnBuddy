// Prepared against real dev-stack scenarios; execute only after ordered integration.
import {
  AnswerResponse,
  SessionView,
  SpeakRequest,
  SpeakWordRequest,
  SpeakWordResponse,
} from '@learnbuddy/shared-types/contracts';
import { expect, test } from '@playwright/test';
import { openMenu } from './coreLoop';
import { onboardChild } from './figureWalk';
import { PHONES, shot } from './fit';
import { PALETTES } from '../../apps/mobile/lib/theme/palettes';

for (const family of ['pastell', 'ocean'] as const) {
  for (const dark of [false, true]) {
    test(`speak · ${family} ${dark ? 'dark' : 'light'}`, async ({ page }) => {
      test.setTimeout(300_000);
      await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
      await onboardChild(page, 'speak');
      await openMenu(page, 'Einstellungen');
      const familyChoice = page.getByRole('radio', {
        name: family === 'pastell' ? 'Pastell' : 'Meer',
        exact: true,
      });
      await familyChoice.click();
      await expect(familyChoice).toBeChecked();
      const mode = page.getByRole('radio', { name: dark ? 'Dunkel' : 'Hell', exact: true });
      await mode.click();
      await expect(mode).toBeChecked();
      await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      const key = dark ? `${family}Dark` : family;
      await openMenu(page, 'Aussprache');
      await page
        .getByRole('textbox', { name: 'Was willst du sagen üben?' })
        .fill('Englisch: The weather is nice today.');
      await page
        .locator('[aria-modal="true"]')
        .getByRole('button', { name: "Los geht's", exact: true })
        .click();
      await expect(page.getByText('The weather is nice today.').first()).toBeVisible();
      const check = page.getByRole('button', { name: 'Aufnahme starten', exact: true });
      const sentence = page.getByRole('heading', {
        name: 'The weather is nice today.',
        exact: true,
      });
      await expect(
        page.getByText('Online: Aufnahme wird gesendet.', { exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Audio bleibt auf dem Gerät.', { exact: true })).toHaveCount(0);
      await expect(sentence).toHaveCSS('font-family', /Figtree/);
      const palette = PALETTES[key as keyof typeof PALETTES];
      const ink = parseInt(palette.ink.slice(1), 16);
      await expect(sentence).toHaveCSS(
        'color',
        `rgb(${ink >> 16}, ${(ink >> 8) & 255}, ${ink & 255})`,
      );
      const frame = check.locator(':scope > div');
      await expect(frame).toHaveCount(1);
      const colour = parseInt(PALETTES[key as keyof typeof PALETTES].primary.slice(1), 16);
      await expect
        .poll(() => frame.evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe(`rgb(${colour >> 16}, ${(colour >> 8) & 255}, ${colour & 255})`);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await shot(page, `speak-${key}-ready-${phone.width}`);
      }
      const abortedBodies: unknown[] = [];
      await page.route(
        '**/v1/practice/sessions/*/speak',
        async (route) => {
          abortedBodies.push(route.request().postDataJSON());
          await route.abort('failed');
        },
        { times: 3 },
      );
      const box = await check.boundingBox();
      if (!box) throw new Error('Recording action has no visible target');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const scale = () =>
        frame.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
      await expect.poll(scale).toBeLessThan(1);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect.poll(scale).toBe(1);
      await page.mouse.up();
      await page.waitForTimeout(1200); // Same audible-length recording as the existing tour.
      await page.getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
      await expect(
        page.getByText('Deine Aufnahme ist noch nicht bei Buddy angekommen.', { exact: true }),
      ).toBeVisible();
      const retried = page.waitForRequest(
        (request) => request.method() === 'POST' && request.url().endsWith('/speak'),
      );
      const retryResponse = page.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith('/speak'),
      );
      await page.getByRole('button', { name: 'Nochmal senden', exact: true }).click();
      expect(abortedBodies).toHaveLength(3);
      for (const body of abortedBodies) expect(body).toEqual(abortedBodies[0]);
      const sentSentence = await retried;
      const sentenceRequest = SpeakRequest.parse(sentSentence.postDataJSON());
      expect(sentenceRequest).toEqual(abortedBodies[0]);
      const sentenceResponse = await retryResponse;
      expect(sentenceResponse.ok()).toBe(true);
      const raw = await sentenceResponse.text();
      const done = sentenceResponse.headers()['content-type']?.includes('text/event-stream')
        ? raw
            .split('\n\n')
            .find((block) => /^event: done$/m.test(block))
            ?.match(/^data: (.+)$/m)?.[1]
        : raw;
      expect(done).toBeDefined();
      const finished = AnswerResponse.parse(JSON.parse(done!)).session;
      expect(finished.status).toBe('finished');
      expect(finished.summary).not.toBeNull();
      await expect(page.getByText('Fast', { exact: true })).toBeVisible();
      // Chromium's CDP body text can decode non-ASCII SSE as Latin-1. The real
      // authenticated JSON endpoint is canonical storage proof without reloading UI.
      const requestHeaders = await sentSentence.allHeaders();
      const headers = Object.fromEntries(
        Object.entries(requestHeaders).filter(
          ([key]) => key === 'authorization' || key === 'cookie',
        ),
      );
      const persisted = await page.request.get(
        new URL(`/v1/practice/sessions/${finished.id}`, sentenceResponse.url()).href,
        { headers },
      );
      expect(persisted.ok()).toBe(true);
      const stored = SessionView.parse(await persisted.json());
      expect(stored.id).toBe(finished.id);
      expect(stored.status).toBe('finished');
      const feedback = stored.turns.find(
        (turn) =>
          turn.role === 'tutor' && turn.item_id === sentenceRequest.item_id && turn.pronunciation,
      )?.pronunciation;
      expect(feedback).toBeDefined();
      const heard = feedback!.heard;
      expect(heard).not.toBe('');
      expect(stored.turns.filter((turn) => turn.role === 'learner')).toContainEqual(
        expect.objectContaining({ item_id: sentenceRequest.item_id, text: `🎤 ${heard}` }),
      );
      await expect(page.getByText(`🎤 ${heard}`, { exact: true })).toHaveCount(0);
      await expect(page.getByText(heard, { exact: true })).toBeVisible();

      const words = page.getByTestId('spoken-word-actions').getByRole('button');
      await expect(words).toHaveCount(5);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        for (const word of await words.all()) {
          const box = await word.boundingBox();
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
          expect(await word.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
            true,
          );
        }
        await shot(page, `speak-${key}-word-targets-${phone.width}`);
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await shot(page, `speak-${key}-word-targets`);
      await page.getByRole('button', { name: 'Wort üben: weather', exact: true }).click();
      const sheet = page.locator('[aria-modal="true"]');
      await expect(sheet.getByRole('heading', { name: 'weather', exact: true })).toBeVisible();
      await expect(
        sheet.getByText('Nur dieses Wort – das zählt nicht für die Aufgabe.'),
      ).toBeVisible();
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await shot(page, `speak-${key}-selected-word-${phone.width}`, { opened: true });
      }
      // Real fake-device audio and API; repeated attempts must preserve the selected word.
      for (let attempt = 0; attempt < 2; attempt++) {
        await sheet.getByRole('button', { name: 'Dieses Wort sagen', exact: true }).click();
        await page.waitForTimeout(1200);
        const request = page.waitForRequest(
          (request) => request.method() === 'POST' && request.url().endsWith('/speak-word'),
        );
        const response = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' && response.url().endsWith('/speak-word'),
        );
        await sheet.getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
        const wordRequest = await request;
        expect(new URL(wordRequest.url()).pathname).toBe(
          `/v1/practice/sessions/${finished.id}/speak-word`,
        );
        const sentWord = SpeakWordRequest.parse(wordRequest.postDataJSON());
        expect(sentWord.item_id).toBe(sentenceRequest.item_id);
        expect(sentWord.word).toBe('weather');
        expect(Buffer.from(sentWord.audio_base64, 'base64').length).toBeGreaterThan(0);
        const wordResponse = await response;
        expect(wordResponse.status()).toBe(200);
        expect(SpeakWordResponse.parse(await wordResponse.json()).audible).toBe(true);
        await expect(
          sheet.getByRole('button', { name: 'Dieses Wort sagen', exact: true }),
        ).toBeEnabled();
        await expect(sheet.getByRole('heading', { name: 'weather', exact: true })).toBeVisible();
      }
      await sheet.getByRole('button', { name: 'Schließen', exact: true }).click();
      await expect(page.getByText('Fast', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Übung beenden', exact: true }).click();
    });
  }
}
