import { expect, test } from '@playwright/test';
import authDe from '../../apps/mobile/locales/de/auth.json';
import authFr from '../../apps/mobile/locales/fr/auth.json';
import buddyDe from '../../apps/mobile/locales/de/buddy.json';
import buddyFr from '../../apps/mobile/locales/fr/buddy.json';
import { sentencesOf } from '../../apps/mobile/lib/speech/readAloud';
import { UI } from '../../apps/mobile/lib/theme/components';
import { paletteOf, themeNameOf } from '../../apps/mobile/lib/theme/palettes';
import {
  ONBOARDING_LOOKS,
  onboardingStart,
  onboardingShots,
  childToParent,
  parentToContact,
} from './redesign-onboarding-matrix';

test.skip(
  process.env.LB_DEV_SPEECH !== 'fake',
  'actual distinct voices require LB_DEV_SPEECH=fake; physical sound is outside silent-provider proof',
);
const cases = [
  ...ONBOARDING_LOOKS.map((look) => ({ look, french: false })),
  { look: ONBOARDING_LOOKS[3], french: true },
];
for (const { look, french } of cases)
  test(`Voice onboarding ${look.family} ${look.dark ? 'dark' : 'light'} ${french ? 'fr' : 'de'}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await onboardingStart(page, look);
    if (french) {
      await page.getByRole('radio', { name: 'Mein Kind' }).click();
      await page.getByRole('button', { name: /Deutsch/ }).click();
      await page.getByRole('radio', { name: 'Français', exact: true }).click();
    }
    await childToParent(page);
    await parentToContact(page);
    await page.getByRole('button', { name: 'Ja, erlauben' }).click();
    await page
      .getByRole('button', {
        name: french ? "C'est parti, Mia !" : "Los geht's, Mia!",
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole('radiogroup', {
          name: french ? 'La voix de Buddy' : 'Buddys Stimme',
          exact: true,
        })
        .getByRole('radio'),
    ).toHaveCount(6);
    const copy = (french ? buddyFr : buddyDe).voice_pick;
    const continueLabel = (french ? authFr : authDe).profile.voice_cta;
    for (const name of Object.values(copy.name))
      await expect(page.getByRole('radio', { name, exact: true })).toBeVisible();
    for (const description of Object.values(copy.about))
      await expect(page.getByText(description, { exact: true })).toBeVisible();
    const warm = page.getByRole('radio', { name: french ? 'Chaleureuse' : 'Warm', exact: true });
    const clear = page.getByRole('radio', { name: french ? 'Nette' : 'Klar', exact: true });
    await expect(warm).toBeChecked();
    const preview = page.getByRole('button', {
      name: french ? 'Écouter : Nette' : 'Hörprobe: Klar',
      exact: true,
    });
    const writes: string[] = [];
    const samples: Array<{ text: string; voice: string }> = [];
    const sampleResponses: Array<{ text: string; voice: string; ok: boolean }> = [];
    page.on('response', (response) => {
      if (response.request().method() === 'POST' && response.url().endsWith('/voice/speech'))
        sampleResponses.push({ ...response.request().postDataJSON(), ok: response.ok() });
    });
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/voice/speech'))
        samples.push(request.postDataJSON());
      if (request.method() === 'PATCH' && request.url().endsWith('/buddy/settings'))
        writes.push(request.url());
    });
    const sample = page.waitForResponse(
      (r) => r.url().endsWith('/voice/speech') && r.request().method() === 'POST',
    );
    // Hold the genuine preview target, then change the system preference while mounted.
    // IconBtn's sole painted child owns the press transform; the radio is a sibling.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const scale = () =>
      preview.evaluate((element) => {
        const frame = element.firstElementChild;
        if (!frame) throw new Error('missing preview frame');
        const transform = getComputedStyle(frame).transform;
        return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
      });
    const target = await preview.boundingBox();
    expect(target).not.toBeNull();
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2);
    await page.mouse.down();
    try {
      await expect.poll(scale).toBeCloseTo(UI.pressScale);
      expect(samples).toHaveLength(0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect.poll(scale).toBe(1);
      await expect(preview).toBeVisible();
    } finally {
      await page.mouse.up();
    }
    const heard = await sample;
    expect(heard.ok()).toBe(true);
    expect(heard.request().postDataJSON()).toMatchObject({ voice: 'clear' });
    const expectedSample = sentencesOf(copy.sample).map((text) => ({ text, voice: 'clear' }));
    await expect
      .poll(() => sampleResponses.map(({ text, voice, ok }) => ({ text, voice, ok })))
      .toEqual(expectedSample.map((part) => ({ ...part, ok: true })));
    await expect(preview).toBeVisible();
    await expect(warm).toBeChecked();
    expect(writes).toHaveLength(0);
    const saved = page.waitForResponse(
      (r) => r.url().endsWith('/buddy/settings') && r.request().method() === 'PATCH',
    );
    await clear.click();
    const response = await saved;
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ voice: 'clear' });
    expect(response.request().postDataJSON()).toMatchObject({ voice: 'clear' });
    await expect(clear).toBeChecked();
    // Preview is sentence-based and prefetches the second sentence; selection adds none.
    expect(samples.map(({ text, voice }) => ({ text, voice }))).toEqual(expectedSample);
    expect(writes).toHaveLength(1);
    const hex = paletteOf(themeNameOf(look.family, look.dark)).primaryLt;
    const v = Number.parseInt(hex.slice(1), 16);
    await expect(clear.locator('..')).toHaveCSS(
      'background-color',
      `rgb(${v >> 16}, ${(v >> 8) & 255}, ${v & 255})`,
    );
    const requestHeaders = await response.request().allHeaders();
    const headers = Object.fromEntries(
      Object.entries(requestHeaders).filter(([key]) => key === 'authorization' || key === 'cookie'),
    );
    const persisted = await page.request.get(response.url(), { headers });
    expect(persisted.ok()).toBe(true);
    expect(await persisted.json()).toMatchObject({ voice: 'clear' });
    for (const name of french ? ['Chaleureuse'] : ['Freundlich']) {
      for (const viewport of [
        { width: 360, height: 740 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        const radio = page.getByRole('radio', { name, exact: true });
        const clipped = await radio.evaluate((element) => {
          const bound = element.getBoundingClientRect();
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          const failures: string[] = [];
          for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            const range = document.createRange();
            range.selectNodeContents(text);
            for (const rect of range.getClientRects())
              if (
                rect.left < bound.left - 0.5 ||
                rect.right > bound.right + 0.5 ||
                rect.top < bound.top - 0.5 ||
                rect.bottom > bound.bottom + 0.5
              )
                failures.push(text.textContent ?? '');
          }
          return failures;
        });
        expect(clipped, `whole ${name} label inside actual radio at ${viewport.width}`).toEqual([]);
        const position = await radio.boundingBox();
        expect(position).not.toBeNull();
        expect(position!.height).toBeGreaterThanOrEqual(44);
        expect(position!.width).toBeGreaterThanOrEqual(44);
        const sampleTarget = radio.locator('..').getByRole('button');
        const samplePosition = await sampleTarget.boundingBox();
        expect(samplePosition).not.toBeNull();
        expect(samplePosition!.height).toBeGreaterThanOrEqual(44);
        expect(samplePosition!.width).toBeGreaterThanOrEqual(44);
        expect(samplePosition!.y).toBeGreaterThanOrEqual(position!.y + position!.height);
      }
    }
    await onboardingShots(
      page,
      `voice-${look.family}-${look.dark}-${french ? 'fr' : 'de'}`,
      look,
      false,
      continueLabel,
    );
    await page.getByRole('button', { name: continueLabel, exact: true }).click();
    expect(writes).toHaveLength(1);
    expect(samples.map(({ text, voice }) => ({ text, voice }))).toEqual(expectedSample);
    await expect(
      page.getByText(french ? 'Dis-le simplement à Buddy' : 'Sag es Buddy einfach', {
        exact: true,
      }),
    ).toBeVisible();
  });
