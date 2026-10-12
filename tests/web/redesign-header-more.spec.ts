import { expect, test } from '@playwright/test';
import { freshEmail, signUpMia, planTest, sendWorksheet } from './coreLoop';
import { onboardChild, startOffer } from './figureWalk';
import { cutControls, shot } from './fit';
import { SCREEN_LOOKS, screenLook, screenShots } from './redesign-screen-matrix';

for (const look of SCREEN_LOOKS)
  test(`Shared Header/More: ${look.family} ${look.dark ? 'dark' : 'light'}`, async ({ page }) => {
    await signUpMia(page, freshEmail('header-more'));
    const key = await screenLook(page, look);
    const more = () => page.getByRole('button', { name: 'Mehr', exact: true }).click();
    await more();
    const menu = page.locator('[aria-modal="true"]:visible');
    await expect(menu).toHaveCount(1);
    const close = menu.getByRole('button', { name: 'Schließen', exact: true });
    await expect(close).toHaveCount(1);
    await expect(close).toHaveText('');
    await expect(menu.getByRole('button')).toHaveText([
      '',
      'Blatt fotografieren',
      'Dein Material',
      'Was Buddy über dich weiß',
      'Verlauf',
      'Einstellungen',
      'Profil',
    ]);
    await screenShots(page, `header-more-${key}`, true);
    await menu.getByRole('button', { name: 'Blatt fotografieren', exact: true }).click();
    await expect(page).toHaveURL(/\/capture$/);
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Vorlesen', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Mehr', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'LearnBuddy', exact: true })).toBeVisible();
    await more();
    await menu.getByRole('button', { name: 'Was Buddy über dich weiß', exact: true }).click();
    await expect(page).toHaveURL(/\/memory$/);
    const sound = page.getByRole('switch', { name: 'Vorlesen', exact: true });
    const before = await sound.getAttribute('aria-checked');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
    await sound.click();
    await expect(sound).toHaveAttribute('aria-checked', before!);
    await more();
    await menu.getByRole('button', { name: 'Profil', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { name: 'Profil', exact: true })).toBeVisible();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Zurück', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await more();
    await menu.getByRole('button', { name: 'Dein Material', exact: true }).click();
    await expect(page).toHaveURL(/\/library$/);
    await more();
    await menu.getByRole('button', { name: 'Verlauf', exact: true }).click();
    await expect(page).toHaveURL(/\/history$/);
    await more();
    await menu.getByRole('button', { name: 'Einstellungen', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.goto('/buddy');
    await page.getByLabel('Schreib Buddy …').fill('Ich spiele Handball');
    await page.getByRole('button', { name: 'Senden', exact: true }).click();
    await expect(page.getByText('Cool – Handball merke ich mir.', { exact: true })).toBeVisible();
    const start = page.getByRole('button', { name: 'Was willst du üben?', exact: true });
    await start.scrollIntoViewIfNeeded();
    await screenShots(page, `header-${key}-returning`);
    await page.setViewportSize({ width: 360, height: 440 });
    await page.getByLabel('Schreib Buddy …').focus();
    await start.scrollIntoViewIfNeeded();
    await expect(start).toBeVisible();
    const box = await start.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(440);
    expect(await cutControls(page)).toEqual([]);
    await shot(page, `header-${key}-returning-keyboard`, { phones: [{ width: 360, height: 440 }] });
    await page.getByLabel('Schreib Buddy …').blur();
    await page.setViewportSize({ width: 390, height: 844 });
    await start.click();
    const chooser = page.locator('[aria-modal="true"]:visible');
    await expect(
      chooser.getByRole('button', { name: 'Thema nennen, Du sagst, worum es geht', exact: true }),
    ).toBeVisible();
    for (const name of [
      'Aus meinem Material',
      'Rollenspiel, Sprechen üben',
      'Vortrag proben, Ich höre zu',
      'Kopfrechnen',
      'Arbeit',
      'Hausaufgabe',
      'Aussprache',
      'Vokabeln',
    ])
      await expect(chooser.getByRole('button', { name, exact: true })).toHaveCount(1);
    await screenShots(page, `header-${key}-chooser`, true);
    await chooser
      .getByRole('button', { name: 'Thema nennen, Du sagst, worum es geht', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Welches Thema?', exact: true })).toBeVisible();
    await expect(page.locator('[aria-modal="true"]:visible')).toHaveCount(1);
    await screenShots(page, `header-${key}-topic`, true);
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Thema nennen, Du sagst, worum es geht', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  });

test('Shared Header callers: material rename waits for More dismissal and saves its factual title', async ({
  page,
}) => {
  await signUpMia(page, freshEmail('header-material'));
  await planTest(page);
  await sendWorksheet(page);
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  await page.getByRole('button', { name: 'Dein Material', exact: true }).click();
  await page.getByRole('button', { name: /^Mathe: / }).click();
  await page.getByRole('button', { name: 'Brüche kürzen und vergleichen', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Fragen ansehen',
      exact: true,
    })
    .click();
  await expect(page.getByRole('switch', { name: 'Vorlesen', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  await page
    .getByRole('button', { name: '„Brüche kürzen und vergleichen“ umbenennen', exact: true })
    .click();
  await expect(page.locator('[aria-modal="true"]:visible')).toHaveCount(1);
  await expect(page.getByLabel('Name des Blatts')).toBeVisible();
  await page.getByLabel('Name des Blatts').fill('Brüche – Test Freitag');
  await screenShots(page, 'header-material-rename', true);
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && /materials/.test(r.url()),
  );
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Brüche – Test Freitag', exact: true }),
  ).toBeVisible();
});

test('Shared Header callers: real card pass has one sound, one More and the preserved close action', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await onboardChild(page, 'header-cards');
  await startOffer(page, 'Lass uns Vokabeln mit Frosch üben', 'zwei Wörter aus Unité 3');
  const answer = async (text: string) => {
    await page.getByLabel('Deine Antwort').fill(text);
    await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
  };
  await answer('die Kröte');
  await expect(page.getByText('Versuch es nochmal', { exact: false })).toBeVisible();
  for (const text of ['der Frosch', 'die Zitrone', 'la grenouille', 'le citron']) {
    await answer(text);
    await expect(page.getByText('Stimmt – gut gemacht!', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Die Wörter als Karten durchgehen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Umdrehen', exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Vorlesen', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Mehr', exact: true })).toHaveCount(1);
  await screenShots(page, 'header-cardpass');
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dein Material', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Lernkarten beenden', exact: true }).click();
  await expect(page).toHaveURL(/\/buddy$/);
});

test('Shared Sheet: named grabber keyboard activation and Escape dismiss the real web host', async ({
  page,
}) => {
  await signUpMia(page, freshEmail('header-keyboard'));
  const more = page.getByRole('button', { name: 'Mehr', exact: true });
  await more.click();
  const close = page.getByRole('button', { name: 'Schließen', exact: true });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  await more.click();
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
});
