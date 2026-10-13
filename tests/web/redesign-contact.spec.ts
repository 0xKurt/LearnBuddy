import { expect, test, type Page, type Request } from '@playwright/test';
import { shot } from './fit';
import {
  ONBOARDING_LOOKS,
  onboardingStart,
  onboardingShots,
  childToParent,
  parentToContact,
} from './redesign-onboarding-matrix';
const creations = new WeakMap<Page, { requests: Request[]; listener: (r: Request) => void }>();
test.beforeEach(({ page }) => {
  const requests: Request[] = [];
  const listener = (r: Request) => {
    if (r.method() === 'POST' && r.url().endsWith('/v1/learner')) requests.push(r);
  };
  creations.set(page, { requests, listener });
  page.on('request', listener);
});
test.afterEach(({ page }, info) => {
  const tracked = creations.get(page)!;
  try {
    if (info.status === info.expectedStatus) expect(tracked.requests).toHaveLength(1);
  } finally {
    page.off('request', tracked.listener);
    creations.delete(page);
  }
});
function expectedLearner(allow: boolean, locale = 'de') {
  return {
    relation: 'child',
    display_name: 'Mia',
    birth_date: '2013-03-14',
    locale,
    curriculum_region: 'ni',
    minor_consent: true,
    contact: allow ? 'yes' : 'no',
    pin: '4826',
  };
}
for (const look of ONBOARDING_LOOKS)
  for (const allow of [true, false])
    test(`Contact ${look.family} ${look.dark ? 'dark' : 'light'} ${allow ? 'allow' : 'skip'}`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await onboardingStart(page, look);
      await childToParent(page);
      await parentToContact(page);
      await page.getByRole('button', { name: 'Zurück', exact: true }).click();
      await expect(page.getByLabel('PIN der Eltern')).toHaveValue('4826');
      await expect(page.getByLabel('PIN wiederholen')).toHaveValue('4826');
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
      await expect(page.getByText('Darf Buddy Mia Benachrichtigungen schicken?')).toBeVisible();
      await expect(page.getByRole('checkbox', { name: /Push-Benachrichtigungen/ })).toHaveCount(0);
      // One main action, the quiet ones below it (design Onboarding.jsx:44–48, #599): "yes",
      // then "no" — no grey bar any more — then the way back.
      const tops: number[] = [];
      for (const name of ['Ja, erlauben', 'Nein, danke', 'Zurück']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box, name).not.toBeNull();
        tops.push(box!.y);
      }
      expect(tops).toEqual([...tops].sort((a, b) => a - b));
      await expect(page.getByText('2 von 4', { exact: true })).toBeVisible();
      await onboardingShots(page, `contact-${look.family}-${look.dark}-${allow}`, look);
      const saved = page.waitForResponse(
        (r) => r.url().endsWith('/v1/learner') && r.request().method() === 'POST',
      );
      await page
        .getByRole('button', { name: allow ? 'Ja, erlauben' : 'Nein, danke', exact: true })
        .click();
      const response = await saved;
      expect(response.ok()).toBe(true);
      expect(response.request().postDataJSON()).toEqual(expectedLearner(allow));
      expect(await response.json()).toMatchObject({
        relation: 'child',
        display_name: 'Mia',
        birth_date: '2013-03-14',
        locale: 'de',
        curriculum_region: 'ni',
      });
      await expect(page.getByText('PIN der Eltern: gesetzt – nur ihr kennt sie')).toBeVisible();
      await expect(
        page.getByText(allow ? /Push-Benachrichtigungen: erlaubt/ : /Push-Benachrichtigungen: aus/),
      ).toBeVisible();
    });

test('Contact saves selected learner English while parent flow remains German', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await onboardingStart(page, ONBOARDING_LOOKS[2]);
  await page.getByRole('radio', { name: 'Mein Kind', exact: true }).click();
  await page.getByRole('button', { name: /Deutsch/ }).click();
  await page.getByRole('radio', { name: 'English', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Wer lernt mit LearnBuddy?', exact: true }),
  ).toBeVisible();
  await childToParent(page);
  await parentToContact(page);
  await expect(page.getByRole('button', { name: 'Ja, erlauben', exact: true })).toBeVisible();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/v1/learner') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Nein, danke', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual(expectedLearner(false, 'en'));
  expect(await response.json()).toMatchObject({
    locale: 'en',
    display_name: 'Mia',
    birth_date: '2013-03-14',
    curriculum_region: 'ni',
  });
  const headers = Object.fromEntries(
    Object.entries(await response.request().allHeaders()).filter(([key]) =>
      ['authorization', 'cookie'].includes(key.toLowerCase()),
    ),
  );
  const persisted = await page.request.get(new URL('/v1/me', response.url()).href, { headers });
  expect(persisted.ok()).toBe(true);
  expect((await persisted.json()).learner).toMatchObject({
    relation: 'child',
    display_name: 'Mia',
    birth_date: '2013-03-14',
    locale: 'en',
    curriculum_region: 'ni',
  });
  await expect(page.getByText('Done! This is set up:', { exact: true })).toBeVisible();
  await expect(
    page.getByText("Parents' PIN: set – only you know it", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^Push notifications: off/)).toBeVisible();
});

test('Contact keeps one real save while the visible busy indicator stops on live reduction', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await onboardingStart(page, ONBOARDING_LOOKS[0]);
  await childToParent(page);
  await parentToContact(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/v1/learner', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });
  const allow = page.getByRole('button', { name: 'Ja, erlauben', exact: true });
  const submitted = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/v1/learner'),
  );
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/v1/learner'),
  );
  await allow.click();
  await submitted;
  try {
    await expect(allow).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Nein, danke', exact: true })).toBeDisabled();
    const running = () =>
      allow.evaluate(
        (element) =>
          [element, ...element.querySelectorAll('*')].filter((node) => {
            const style = getComputedStyle(node);
            return (
              style.animationName !== 'none' &&
              style.animationDuration !== '0s' &&
              style.animationPlayState === 'running'
            );
          }).length,
      );
    await expect.poll(running, 'busy indicator animates with normal motion').toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(running, 'same busy control stops on live reduction').toBe(0);
    await expect(allow.locator('[role="progressbar"]')).toBeVisible();
    await shot(page, 'contact-busy-reduced');
    const bounds = await allow.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    expect(creations.get(page)!.requests).toHaveLength(1);
  } finally {
    release();
    await saved;
  }
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual(expectedLearner(true));
  await expect(page.getByText('PIN der Eltern: gesetzt – nur ihr kennt sie')).toBeVisible();
});
