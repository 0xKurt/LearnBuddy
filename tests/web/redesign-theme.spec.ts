// Theme foundation: real foreground changes, shipped fonts and small-phone layout.
import { expect, test, type Page } from '@playwright/test';

import { freshEmail, openMenu, planTest, signUpMia } from './coreLoop';
import { PHONES, shot } from './fit';

async function touchTargets(page: Page): Promise<void> {
  const small = await page
    .locator('[role="button"], [role="radio"], [role="switch"], input')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        // Hidden native visuals inside a web control are decoration; the outer
        // accessible switch is the actual keyboard, screen-reader and pointer target.
        if (element.closest('[aria-hidden="true"]')) return [];
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height || box.bottom <= 0 || box.top >= innerHeight) return [];
        return box.width < 43.5 || box.height < 43.5
          ? [
              `${element.getAttribute('aria-label') ?? element.textContent}: ${box.width}×${box.height}`,
            ]
          : [];
      }),
    );
  expect.soft(small, 'visible controls have 44pt touch targets').toEqual([]);
}

async function motionSamples(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const values: string[] = [];
    for (let i = 0; i < 3; i++) {
      values.push(
        Array.from(document.querySelectorAll<HTMLElement>('[style*="transform"]'))
          .filter((element) => element.getBoundingClientRect().width > 0)
          .map((element) => element.style.transform)
          .join('|'),
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return values;
  });
}

/** Per watched words: every element they stand in, with how it looked on each frame. */
type Watched = Map<string, Map<Element, string[]>>;
type EntranceWindow = Window & { lbEntrances?: Watched };

/**
 * Watches how the given words come onto the screen, frame by frame, from now on. A message's
 * entrance is a Reanimated shared value written to the element's style on every frame
 * (components/lb/Motion.tsx `Rise`, `Appear`) — not a CSS animation, so no `animationstart` ever
 * fires for it (#599). What is sampled is what she sees: for each element the words stand in,
 * the opacity down its ancestors multiplied and their transforms. An entrance passes through
 * many values; words that simply stand (or are dimmed once while sending) show one or two.
 */
async function watchEntrances(page: Page, words: readonly string[]): Promise<void> {
  await page.evaluate((watched) => {
    const seen: Watched = new Map(watched.map((w) => [w, new Map<Element, string[]>()]));
    (window as EntranceWindow).lbEntrances = seen;
    const look = (el: Element): string => {
      let opacity = 1;
      const transforms: string[] = [];
      for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
        const style = getComputedStyle(e);
        opacity *= parseFloat(style.opacity);
        if (style.transform !== 'none') transforms.push(style.transform);
      }
      return `${opacity.toFixed(3)} ${transforms.join(';')}`;
    };
    const frame = () => {
      // A later watch replaced this one: stop.
      if ((window as EntranceWindow).lbEntrances !== seen) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent) continue;
        for (const [w, places] of seen) {
          if (!node.textContent?.includes(w)) continue;
          const looks = places.get(parent) ?? [];
          looks.push(look(parent));
          places.set(parent, looks);
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, words);
}

/**
 * Per watched words, of the element that was watched longest and of the one that changed most:
 * how many frames, and how many different looks.
 */
async function entrances(page: Page): Promise<Array<{ frames: number; looks: number }>> {
  return page.evaluate(() => {
    const seen: Watched = (window as EntranceWindow).lbEntrances ?? new Map();
    return [...seen.values()].map((places) => {
      const all = [...places.values()];
      return {
        frames: Math.max(0, ...all.map((looks) => looks.length)),
        looks: Math.max(0, ...all.map((looks) => new Set(looks).size)),
      };
    });
  });
}

/** More looks than standing, or standing dimmed and then whole, can explain: it moved in. */
const MOVED_IN = 3;
/** Half a second of frames: longer than any entrance takes (lib/theme/motionDurations.ts). */
const WATCHED_FRAMES = 30;

test('theme foundation: fonts and live reduced motion for message entrances', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.getByLabel('E-Mail')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await document.fonts.ready;
        const families = [
          'Figtree_400Regular',
          'Figtree_500Medium',
          'Figtree_600SemiBold',
          'Figtree_700Bold',
          'Figtree_800ExtraBold',
        ];
        // Web FontFace assets load lazily until their weight is used. Exercise each
        // registered shipped face, so missing or broken assets cannot pass silently.
        await Promise.all(families.map((family) => document.fonts.load(`16px "${family}"`)));
        return families.every((family) =>
          Array.from(document.fonts).some(
            (font) => font.family.replaceAll('"', '') === family && font.status === 'loaded',
          ),
        );
      }),
    )
    .toBe(true);
  await expect(page.getByLabel('E-Mail')).toHaveCSS('font-family', /Figtree/);
  expect(
    new Set(await motionSamples(page)).size,
    'idle decoration actually animates',
  ).toBeGreaterThan(1);
  // The owner explicitly preserves Buddy's moon heartbeat (orbRoom.ts).
  // Live reduced motion is checked on message entrances below, not that loop.
  await shot(page, 'theme-welcome-fonts');
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await touchTargets(page);
  }

  await signUpMia(page, freshEmail('theme'));
  // The positive control: with motion allowed, the turn's messages move in (planTest's words).
  await watchEntrances(page, [
    'Ich schreibe am Freitag eine Mathearbeit über Brüche.',
    'Eingetragen: Mathearbeit Brüche am',
  ]);
  await planTest(page);
  await expect
    .poll(async () => (await entrances(page)).some(({ looks }) => looks >= MOVED_IN), {
      message: 'with motion allowed a new message moves in',
    })
    .toBe(true);
  // Live: the system asks for less motion while the app is open — the next turn just stands.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const message = 'Mach die Übungen bitte kürzer.';
  const reply = 'Mach ich – ab jetzt kurze Runden.';
  await watchEntrances(page, [message, reply]);
  await page.getByLabel('Schreib Buddy …').fill(message);
  await page.getByRole('button', { name: 'Senden', exact: true }).click();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  // Watched for as long as an entrance would take, on both messages.
  await expect
    .poll(async () => Math.min(...(await entrances(page)).map(({ frames }) => frames)))
    .toBeGreaterThanOrEqual(WATCHED_FRAMES);
  expect(
    (await entrances(page)).filter(({ looks }) => looks >= MOVED_IN),
    'live reduced motion skips new message fades',
  ).toEqual([]);
});

test('theme foundation: Pastell/Meer light/dark phone matrix', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await signUpMia(page, freshEmail('theme-matrix'));
  for (const family of ['Pastell', 'Meer'] as const) {
    for (const dark of [false, true]) {
      await openMenu(page, 'Einstellungen');
      await page.getByRole('radio', { name: family, exact: true }).click();
      const toggle = page.getByRole('radio', { name: dark ? 'Dunkel' : 'Hell', exact: true });
      await toggle.click();
      await expect(page.getByRole('radio', { name: family, exact: true })).toBeChecked();
      await expect(toggle).toBeChecked();
      const name = `theme-${family.toLowerCase()}-${dark ? 'dark' : 'light'}`;
      await shot(page, `${name}-settings`, { opened: true });
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await touchTargets(page);
      }
      await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      await expect(page.getByText('LearnBuddy', { exact: true })).toBeVisible();
      await shot(page, `${name}-home`);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await touchTargets(page);
      }
      await page.getByRole('button', { name: 'Mehr', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
      // The menu is one list of places (#599): "Verlauf" is a row of it.
      await expect(page.getByRole('button', { name: 'Verlauf', exact: true })).toBeVisible();
      await shot(page, `${name}-menu`, { opened: true });
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await touchTargets(page);
      }
      await page.getByRole('button', { name: 'Schließen', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Verlauf', exact: true })).toBeHidden();
    }
  }
});
