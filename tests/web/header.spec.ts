// The one head of the app, measured in a browser (owner rule 1, #599; design
// components/buddy/Header.jsx): on every screen Buddy's orb sits in the head in the state the
// screen gives it, the title stays on one line clear of the moon's room, and the Vorlesen switch
// and ⋯ stand whole at its right end — at 390 and 360, light and dark. What jsdom can tell is
// apps/mobile/components/lb/__tests__/BuddyHeader.test.tsx; that every route has the head is
// apps/mobile/lib/__tests__/headerShell.test.ts. One fresh learner, one way through the app.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { freshEmail, openMenu, PIN, sendWorksheet, signUpMia } from './coreLoop';
import { overflows, PHONES, setScheme, settle, SHOTS } from './fit';

const OUT = join(SHOTS, 'header');
const SCHEMES = ['light', 'dark'] as const;
type Pose = 'idle' | 'listen' | 'think' | 'speak' | 'wait' | 'happy';

type Measured = {
  pose: string;
  slot: { left: number; right: number; width: number };
  title: { left: number; right: number; width: number; lines: number; cut: boolean };
  sound: { left: number; right: number; width: number; height: number } | null;
  more: { left: number; right: number; width: number; height: number } | null;
  view: number;
};

/** The head of the screen on top, as the browser laid it out; null when there is none. */
function measure(page: Page): Promise<Measured | null> {
  return page.evaluate(() => {
    const shown = (el: Element) =>
      el.closest('[aria-hidden="true"]') === null &&
      el.getBoundingClientRect().width > 0 &&
      (el as HTMLElement).checkVisibility({ visibilityProperty: true });
    const slot = [...document.querySelectorAll('[data-testid^="header-orb-"]')]
      .filter(shown)
      .at(-1);
    const row = slot?.parentElement;
    const heading = row?.querySelector('[role="heading"]');
    if (!slot || !row || !heading) return null;
    const box = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const title = heading.getBoundingClientRect();
    const line = Number.parseFloat(getComputedStyle(heading).lineHeight);
    const s = slot.getBoundingClientRect();
    return {
      pose: (slot.getAttribute('data-testid') ?? '').replace('header-orb-', ''),
      slot: { left: s.left, right: s.right, width: s.width },
      title: {
        left: title.left,
        right: title.right,
        width: title.width,
        lines: Math.round(title.height / line),
        // One line is not enough: a title that ends in "…" lost its end.
        cut: heading.scrollWidth > heading.clientWidth,
      },
      sound: box(row.querySelector('[role="switch"]')),
      more: box(row.querySelector('[aria-label="Mehr"]')),
      view: innerWidth,
    };
  });
}

/**
 * What a head is expected to show. `more: false` — the one head without ⋯; `more: 'own'` — a
 * practice question, whose ⋯ is its own and there only while the question has an action.
 */
type Want = { pose?: Pose; more?: boolean | 'own' };

/**
 * Titles that are cut today, and nothing else may be. Both wait for the owner (#599, review of
 * #604): since the head carries the switch and ⋯ on every screen, its title column is 162 pt
 * at 390 and 132 pt at 360 — as in the prototype, which ellipsizes the same titles. A title that
 * is whole again fails here too: its entry goes.
 */
const CUT_TITLES: ReadonlyArray<{
  screen: RegExp;
  widths: readonly number[];
  /** Only beside a ⋯: a question without an action of its own draws none, and the title fits. */
  besideMore?: true;
  why: string;
}> = [
  {
    screen: /^memory$/,
    widths: [390, 360],
    why: '"Was Buddy über dich weiß": owner decision on a shorter title',
  },
  {
    screen: /^(practice-(open|wrong|checking|correct)|done)$/,
    widths: [360],
    besideMore: true,
    why: 'the session title "Mathearbeit Brüche" beside two controls at 360',
  },
];
const cutExpected = (screen: string, m: Measured) =>
  CUT_TITLES.some(
    (c) => c.screen.test(screen) && c.widths.includes(m.view) && (!c.besideMore || m.more !== null),
  );

/** What every head must hold, whatever its screen. */
function check(m: Measured | null, screen: string, look: string, want: Want): void {
  const at = `${screen} ${look}`;
  expect.soft(m, `${at}: the screen has the head`).not.toBeNull();
  if (!m) return;
  if (want.pose) expect.soft(m.pose, `${at}: the orb's state`).toBe(want.pose);
  expect.soft(m.title.lines, `${at}: the title on one line`).toBe(1);
  expect
    .soft(m.title.cut, `${at}: the title whole (cut only where CUT_TITLES says so)`)
    .toBe(cutExpected(screen, m));
  // The slot is the moon's room (1.85 × the orb): the title begins after it.
  expect
    .soft(m.title.left, `${at}: the moon's room clear of the title`)
    .toBeGreaterThanOrEqual(m.slot.right - 0.5);
  expect.soft(m.title.width, `${at}: the title keeps room beside the controls`).toBeGreaterThan(80);
  expect.soft(m.sound, `${at}: the Vorlesen switch`).not.toBeNull();
  for (const [name, control] of [
    ['Vorlesen', m.sound],
    ['⋯', want.more === false ? null : m.more],
  ] as const) {
    if (!control) continue;
    expect
      .soft(control.width, `${at}: ${name} is a whole touch target`)
      .toBeGreaterThanOrEqual(43.5);
    expect
      .soft(control.height, `${at}: ${name} is a whole touch target`)
      .toBeGreaterThanOrEqual(43.5);
    expect.soft(control.right, `${at}: ${name} inside the screen`).toBeLessThanOrEqual(m.view);
    expect
      .soft(control.left, `${at}: ${name} after the title`)
      .toBeGreaterThanOrEqual(m.title.right - 0.5);
  }
  if (want.more === false) expect.soft(m.more, `${at}: no ⋯ here`).toBeNull();
  else {
    if (want.more !== 'own') expect.soft(m.more, `${at}: ⋯`).not.toBeNull();
    if (m.more && m.sound)
      expect
        .soft(m.more.left, `${at}: ⋯ after the switch`)
        .toBeGreaterThanOrEqual(m.sound.right - 0.5);
  }
}

/** One screen that stands still: both phones, both schemes, shot and measured. */
async function head(
  page: Page,
  name: string,
  want: Want = {},
  schemes: ReadonlyArray<(typeof SCHEMES)[number]> = SCHEMES,
): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  for (const scheme of schemes) {
    await setScheme(page, scheme);
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await settle(page, 900);
      await page.screenshot({ path: join(OUT, `${name}-${scheme}-${phone.width}.png`) });
      check(await measure(page), name, `${scheme} @${phone.width}`, want);
    }
  }
  await setScheme(page, 'light');
  await page.setViewportSize(PHONES[0]!);
}

/** A state that passes: shot the moment the head shows it, at the size the screen has now. */
async function passing(
  page: Page,
  name: string,
  pose: Pose,
  variant: string,
  more: Want['more'] = true,
): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  await expect
    .soft(page.locator(`[data-testid="header-orb-${pose}"]:visible`).last(), `${name}: ${pose}`)
    .toBeVisible({ timeout: 6000 });
  await page.screenshot({ path: join(OUT, `${name}-${variant}.png`) });
  check(await measure(page), name, variant, { pose, more });
}

/** The four looks of a passing state, one after the other. */
const VARIANTS = SCHEMES.flatMap((scheme) => PHONES.map((phone) => ({ scheme, phone })));

/** Holds a request back, so the state it leaves on screen can be seen. */
async function slow(
  page: Page,
  url: RegExp,
  method: string,
  ms: number,
): Promise<() => Promise<void>> {
  const handler = async (route: import('@playwright/test').Route) => {
    if (route.request().method() === method) await new Promise((r) => setTimeout(r, ms));
    await route.continue();
  };
  await page.route(url, handler);
  return () => page.unroute(url, handler);
}

/** What she says in each of the four looks: sentences the scripted model knows (core-loop.ts). */
const SAID = [
  'Ich schreibe am Freitag eine Mathearbeit über Brüche.',
  'Mach die Übungen bitte kürzer.',
  'Erinnere mich morgen um 16 Uhr an Brüche.',
  'Ich will mit dem Arbeitsblatt Brüche üben',
];

/** One message in look `n`: the head thinks from the tap, speaks where the answer is written. */
async function say(page: Page, n: number): Promise<void> {
  const { scheme, phone } = VARIANTS[n]!;
  const variant = `${scheme}-${phone.width}`;
  await setScheme(page, scheme);
  await page.setViewportSize(phone);
  const release = await slow(page, /\/buddy\/messages$/, 'POST', 1200);
  await page.getByLabel('Schreib Buddy …').fill(SAID[n]!);
  await page.getByTestId('composer-primary').getByRole('button', { name: 'Senden' }).click();
  await passing(page, 'chat-thinking', 'think', variant);
  // An answer is written out word by word only when it changes nothing; where it is, it shows.
  const speaking = page.locator('[data-testid="header-orb-speak"]:visible').last();
  if (
    await speaking.waitFor({ state: 'visible', timeout: 5000 }).then(
      () => true,
      () => false,
    )
  )
    await page.screenshot({ path: join(OUT, `chat-speaking-${variant}.png`) });
  await expect(page.locator('[data-testid="header-orb-idle"]:visible').last()).toBeVisible({
    timeout: 30_000,
  });
  await release();
  await setScheme(page, 'light');
  await page.setViewportSize(PHONES[0]!);
}

test('the head on every screen: orb state, one-line title, Vorlesen and ⋯', async ({ page }) => {
  test.setTimeout(780_000);
  // A step that cannot be taken says so soon, not when the whole walk runs out.
  page.setDefaultTimeout(30_000);
  await signUpMia(page, freshEmail('header'));

  // ── The chat ──
  await head(page, 'chat-idle', { pose: 'idle' });
  await page.getByLabel('Schreib Buddy …').fill('Ich schreibe am Freitag');
  // Listening while she writes waits for the Composer's signal (#599): the shot shows today's head.
  await head(page, 'chat-typing');
  await page.getByLabel('Schreib Buddy …').fill('');

  // Sent → thinking → the answer arrives → speaking. Each look says something of its own: the
  // first here, the other three once the practice is done (SAID).
  await say(page, 0);
  await expect(page.getByText(/Eingetragen: Mathearbeit Brüche am/).first()).toBeVisible();

  // ⋯ in the chat: the ways to start and the places.
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dein Material' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: join(OUT, 'chat-menu-light-390.png') });
  await page.getByRole('button', { name: 'Schließen', exact: true }).last().click();

  // ── A practice ──
  await sendWorksheet(page);
  await expect(page.getByRole('button', { name: 'Jetzt üben' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Jetzt üben' }).click();
  await expect(page.getByText('Frage 1 von 4')).toBeVisible();
  const practice = page.url();
  await head(page, 'practice-open', { pose: 'wait', more: 'own' });

  // Loading: the head is there at once, Buddy thinks.
  let release = await slow(page, /\/practice\/sessions\/[^/]+$/, 'GET', 6000);
  for (const { scheme, phone } of VARIANTS) {
    await setScheme(page, scheme);
    await page.setViewportSize(phone);
    await page.goto(practice);
    // The app's own start lies over the page for a moment (`SplashHandoff`): wait it out.
    await expect(page.locator('[data-testid="header-orb-think"]:visible').last()).toBeVisible();
    await page.waitForTimeout(1800);
    await passing(page, 'practice-loading', 'think', `${scheme}-${phone.width}`);
    await expect(page.getByText('Frage 1 von 4')).toBeVisible();
  }
  await release();
  await setScheme(page, 'light');
  await page.setViewportSize(PHONES[0]!);

  // A try that is not right yet: the task is still open, Buddy waits again.
  await page.getByLabel('Deine Antwort').fill('0,5');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByTestId('thread-turn').first()).toBeVisible();
  // Not right yet: Buddy speaks about it (design App.jsx:62) — until she starts her next answer.
  // A change of scheme draws the app anew, and a reply that was there when the screen opened
  // moves nothing: the dark shots show the task waiting.
  await head(page, 'practice-wrong', { pose: 'speak', more: 'own' }, ['light']);
  await head(page, 'practice-wrong', { pose: 'wait', more: 'own' }, ['dark']);
  await page.getByLabel('Deine Antwort').fill('0,5');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.locator('[data-testid="header-orb-speak"]:visible').last()).toBeVisible();
  await page.getByLabel('Deine Antwort').fill('0');
  await expect(page.locator('[data-testid="header-orb-wait"]:visible').last()).toBeVisible();

  // Checking → thinking; right → happy. One look per question.
  release = await slow(page, /\/practice\/sessions\/[^/]+\/answer$/, 'POST', 1500);
  const answers = [
    { field: '0,75' },
    { choice: '2 Drittel' },
    { field: 'Nenner' },
    { field: 'Damit der Wert gleich bleibt.' },
  ];
  for (const [n, answer] of answers.entries()) {
    const { scheme, phone } = VARIANTS[n]!;
    await setScheme(page, scheme);
    await page.setViewportSize(phone);
    const variant = `${scheme}-${phone.width}`;
    await expect(page.getByText(`Frage ${n + 1} von 4`)).toBeVisible();
    if (answer.choice) await page.getByRole('radio', { name: answer.choice, exact: true }).click();
    else await page.getByLabel('Deine Antwort').fill(answer.field ?? '');
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await passing(page, 'practice-checking', 'think', variant, 'own');
    await expect(page.getByText('Richtig', { exact: true }).last()).toBeVisible();
    await passing(page, 'practice-correct', 'happy', variant, 'own');
    await page.getByRole('button', { name: 'Weiter' }).click();
  }
  await release();
  await setScheme(page, 'light');
  await page.setViewportSize(PHONES[0]!);

  // ── Done: Buddy is happy in the head; "Zurück zu Buddy" is one button, the head closes ──
  await expect(page.getByText('Fertig', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zurück zu Buddy' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
  await head(page, 'done', { pose: 'happy' });
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
  await expect(page.getByRole('heading', { name: 'LearnBuddy', exact: true })).toBeVisible();
  for (const n of [1, 2, 3]) await say(page, n);

  // ── A practice that cannot be loaded: the head with its way out, Buddy thinks ──
  const lost = /\/practice\/sessions\/[^/]+$/;
  await page.route(lost, (route) => route.fulfill({ status: 404, body: '{}' }));
  await page.goto(practice);
  await expect(page.getByRole('button', { name: 'Zurück zu Buddy' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
  await head(page, 'practice-stuck', { pose: 'think' });
  await page.unroute(lost);
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
  await expect(page.getByRole('heading', { name: 'LearnBuddy', exact: true })).toBeVisible();

  // ── The places, each with the same head ──
  await openMenu(page, 'Dein Material');
  await expect(page.getByRole('heading', { name: 'Dein Material', exact: true })).toBeVisible();
  await head(page, 'library', { pose: 'idle' });
  await page.goto('/memory');
  await expect(page.getByRole('heading', { name: 'Was Buddy über dich weiß' })).toBeVisible();
  await head(page, 'memory', { pose: 'idle' });

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Einstellungen', exact: true })).toBeVisible();
  await head(page, 'settings', { pose: 'idle' });

  await page.goto('/library');
  await page.getByRole('button', { name: /^Mathe: / }).click();
  await expect(page.getByRole('heading', { name: 'Mathe', exact: true })).toBeVisible();
  await head(page, 'subject', { pose: 'idle' });
  await page.getByRole('button', { name: 'Brüche kürzen und vergleichen', exact: true }).click();
  await page
    .locator('[aria-modal="true"]:visible')
    .getByRole('button', { name: 'Fragen ansehen', exact: true })
    .click();
  await expect(page).toHaveURL(/\/material\//);
  await expect(page.getByText(/^Welcher Bruch ist größer:/).first()).toBeVisible();
  await head(page, 'material', { pose: 'wait' });
  const material = page.url();

  // ── The parents' PIN: the head with the way out, Buddy waits; a wrong PIN and he speaks up ──
  await page.goto('/pin');
  await expect(page.getByRole('heading', { name: 'PIN der Eltern', exact: true })).toBeVisible();
  // The head closes; "Abbrechen" is the page's own button (rule 14), once.
  await expect(page.getByRole('button', { name: 'Schließen', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abbrechen', exact: true })).toHaveCount(1);
  // The lead stands under the head, the pad at the bottom, and all of it fits both phones.
  for (const phone of PHONES) {
    await page.setViewportSize(phone);
    await settle(page, 900);
    expect((await overflows(page)).filter((o) => !o.allowed)).toEqual([]);
    const lead = await page.getByText(/deine Eltern erlauben/).boundingBox();
    const cancel = await page.getByRole('button', { name: 'Abbrechen', exact: true }).boundingBox();
    expect(lead!.y, `PIN @${phone.width}: the lead under the head`).toBeLessThan(90);
    expect(
      cancel!.y + cancel!.height,
      `PIN @${phone.width}: the last button at the bottom`,
    ).toBeGreaterThan(phone.height - 60);
  }
  await page.setViewportSize(PHONES[0]!);
  await head(page, 'pin', { pose: 'wait', more: false });
  const wrong = PIN === '0000' ? '1111' : '0000';
  for (const digit of wrong) await page.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByText('Die PIN stimmt nicht.')).toBeVisible();
  await head(page, 'pin-error', { pose: 'speak', more: false }, ['light']);
  // A change of scheme draws the app anew and the pad starts over: the wrong PIN once more.
  await setScheme(page, 'dark');
  for (const digit of wrong) await page.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByText('Die PIN stimmt nicht.')).toBeVisible();
  await head(page, 'pin-error', { pose: 'speak', more: false }, ['dark']);

  // ── ⋯ and the switch away from the chat: the same sheet, the same switch ──
  await page.goto('/library');
  // The app's own start lies over the page for a moment after a load (`SplashHandoff`).
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  await settle(page);
  await page.screenshot({ path: join(OUT, 'library-menu-light-390.png') });
  // The place she is in already: the sheet closes and she is there, not there twice.
  await page.getByRole('button', { name: 'Dein Material', exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.locator('[aria-modal="true"]:visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  await page.getByRole('button', { name: 'Was Buddy über dich weiß', exact: true }).click();
  await expect(page).toHaveURL(/\/memory$/);
  // One tap turns Vorlesen, the next turns it back — the chat's switch, on every screen.
  const sound = page.getByRole('switch', { name: 'Vorlesen' }).last();
  const before = await sound.getAttribute('aria-checked');
  const glyph = () =>
    sound.locator('path').evaluateAll((paths) => paths.map((x) => x.getAttribute('d')));
  const drawn = await glyph();
  await page.screenshot({
    path: join(OUT, `switch-${before === 'true' ? 'on' : 'off'}-light-390.png`),
  });
  await sound.click();
  await expect(sound).not.toHaveAttribute('aria-checked', before ?? '');
  // On or off is the glyph's own shape (waves or a cross), never its colour.
  expect(await glyph()).not.toEqual(drawn);
  await page.screenshot({
    path: join(OUT, `switch-${before === 'true' ? 'off' : 'on'}-light-390.png`),
  });
  await sound.click();
  await expect(sound).toHaveAttribute('aria-checked', before ?? '');

  // A sheet's own action stands in ⋯, before the places.
  await page.goto(material);
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  // The entry reads "Umbenennen", alone or after the sheet's name: either way it ends in it.
  await page
    .locator('[aria-modal="true"]:visible')
    .getByRole('button', { name: /umbenennen$/i })
    .click();
  await expect(page.getByLabel('Name des Blatts')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: join(OUT, 'material-rename-light-390.png') });
});
