// The settings as the design has them (#589, #599; ui_kits/app/Settings.jsx, More.jsx, Flows.jsx):
// one screen of rows, and a page behind each row — Aufs Handy, Lernzeiten, Über LearnBuddy,
// Lizenzen, the parents' page. Nothing unfolds in place and none of these is a sheet. Every page
// is shot in Pastell and Meer, light and dark, at both phone sizes; a page that is not a browsed
// list has to fit without scrolling (`shot` without `opened`).
import { expect, test, type Page } from '@playwright/test';
import { PIN, freshEmail, signUpMia } from './coreLoop';
import { shot } from './fit';
import { SETTINGS_LOOKS, settingsLook, settingsShots } from './redesign-settings-matrix';

const back = (page: Page) => page.getByRole('button', { name: 'Zurück', exact: true }).click();
const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true });
/** The parents' PIN on the PIN screen's pad. */
async function enterPin(page: Page): Promise<void> {
  await expect(heading(page, 'PIN der Eltern')).toBeVisible();
  for (const digit of PIN) await page.getByRole('button', { name: digit, exact: true }).click();
}
const settingsPatch = (page: Page) =>
  page.waitForResponse(
    (r) => r.url().endsWith('/buddy/settings') && r.request().method() === 'PATCH',
  );

test('settings: rows that lead to pages, in every look', async ({ page }) => {
  test.setTimeout(480_000);
  await signUpMia(page, freshEmail('settings-redesign'));
  for (const look of SETTINGS_LOOKS) {
    const key = await settingsLook(page, look);
    await expect(heading(page, 'Einstellungen')).toBeVisible();
    await expect(page.getByText(/^Ja – nie nach/)).toBeVisible();
    // Rows, not folds: nothing on the screen opens in place, and nothing is a sheet.
    await expect(page.locator('[aria-expanded]')).toHaveCount(0);
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    for (const row of ['Farbe', 'Hell oder dunkel', 'Sprache', 'Aufs Handy'])
      await expect(page.getByText(row, { exact: true })).toBeVisible();
    await settingsShots(page, `settings-${key}`);
    await page.getByRole('button', { name: 'Lizenzen', exact: true }).scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('button', { name: 'Daten exportieren', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Konto löschen', exact: true })).toBeVisible();
    // Behind the parents' gate, not on the settings.
    await expect(page.getByText('Passwort ändern')).toHaveCount(0);
    await settingsShots(page, `settings-${key}-bottom`);

    await page.getByRole('button', { name: /^Aufs Handy, Ja – nie nach/ }).click();
    await expect(page).toHaveURL(/\/settings\/contact$/);
    await expect(heading(page, 'Aufs Handy')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nicht mehr erlauben' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Bis morgen/ })).toBeVisible();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await settingsShots(page, `settings-${key}-contact`);
    await back(page);

    await page.getByRole('button', { name: /^Lernzeiten, / }).click();
    await expect(page).toHaveURL(/\/settings\/times$/);
    await expect(heading(page, 'Lernzeiten')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(7);
    await expect(page.getByRole('switch', { name: 'Ruhe am Wochenende' })).toBeVisible();
    await settingsShots(page, `settings-${key}-times`);
    await back(page);

    await page.getByRole('button', { name: 'Über LearnBuddy', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/about$/);
    await expect(page.getByText('Version', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Datenschutzerklärung' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Impressum' })).toBeVisible();
    await settingsShots(page, `settings-${key}-about`);
    // "Lizenzen" is reachable from here too; the way back returns to this page.
    await page.getByRole('button', { name: 'Lizenzen', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/licences$/);
    await expect(page.getByText(/mit freier Software gebaut/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^@babel\/runtime [\d.]+, MIT$/ })).toBeVisible();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await settingsShots(page, `settings-${key}-licences`);
    await back(page);
    await expect(heading(page, 'Über LearnBuddy')).toBeVisible();
    await back(page);
    await expect(heading(page, 'Einstellungen')).toBeVisible();

    // The parents' page: only through the PIN, and only what the gate approved.
    await page.getByRole('button', { name: /^Anmeldung und PIN/ }).click();
    await enterPin(page);
    await expect(page).toHaveURL(/\/settings\/parents$/);
    await expect(heading(page, 'Für Eltern')).toBeVisible();
    await expect(page.getByRole('button', { name: /^PIN ändern/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Profil korrigieren, Mia, geboren am/ }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^E-Mail ändern/ })).toBeVisible();
    await settingsShots(page, `settings-${key}-parents`);
    await back(page);
    await expect(heading(page, 'Einstellungen')).toBeVisible();
  }
});

test('the look row: "System" stays on one line at 360, and the switch holds three words', async ({
  page,
}) => {
  await signUpMia(page, freshEmail('settings-look-row'));
  await page.goto('/settings');
  await page.setViewportSize({ width: 360, height: 740 });
  const system = page.getByRole('radio', { name: 'System', exact: true });
  await expect(system).toBeChecked();
  for (const name of ['System', 'Hell', 'Dunkel']) {
    const lines = await page.getByRole('radio', { name, exact: true }).evaluate((radio) => {
      const walker = document.createTreeWalker(radio, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let rects = 0;
      while (walker.nextNode()) {
        range.selectNodeContents(walker.currentNode);
        rects += range.getClientRects().length;
      }
      return rects;
    });
    expect(lines, `${name} on one line`).toBe(1);
  }
  await shot(page, 'settings-look-row', { phones: [{ width: 360, height: 740 }] });
});

test('Lernzeiten: a day off goes at once; a day back, and an end of the quiet weekend, need the parents', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signUpMia(page, freshEmail('settings-times'));
  await settingsLook(page, SETTINGS_LOOKS[0]);
  await page.getByRole('button', { name: /^Lernzeiten, / }).click();
  const wednesday = page.getByRole('checkbox', { name: 'Mittwoch', exact: true });
  await expect(wednesday).toBeChecked();
  let saved = settingsPatch(page);
  await wednesday.click();
  let response = await saved;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({
    avoid_weekdays: [3],
    version: expect.any(Number),
  });
  await expect(wednesday).not.toBeChecked();

  // Back on allows more contact: the PIN screen first, nothing is sent before it.
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().endsWith('/buddy/settings'))
      sent.push(r.postData() ?? '');
  });
  await wednesday.click();
  await expect(page.getByRole('heading', { name: 'PIN der Eltern', exact: true })).toBeVisible();
  expect(sent).toEqual([]);
  saved = settingsPatch(page);
  await enterPin(page);
  response = await saved;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({
    avoid_weekdays: [],
    version: expect.any(Number),
  });
  await expect(page.getByRole('heading', { name: 'Lernzeiten', exact: true })).toBeVisible();
  await expect(wednesday).toBeChecked();

  // The quiet weekend is Saturday and Sunday in the same field.
  const weekend = page.getByRole('switch', { name: 'Ruhe am Wochenende' });
  await expect(weekend).not.toBeChecked();
  saved = settingsPatch(page);
  await weekend.click();
  expect((await saved).request().postDataJSON()).toEqual({
    avoid_weekdays: [6, 7],
    version: expect.any(Number),
  });
  await expect(weekend).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Samstag', exact: true })).not.toBeChecked();
  await settingsShots(page, 'settings-times-weekend');

  // The time of day: a short pick in the shared sheet, one save.
  await page.getByRole('button', { name: /^Wann am liebsten\?, / }).click();
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
  await settingsShots(page, 'settings-times-window', true);
  saved = settingsPatch(page);
  await page.getByRole('radio', { name: '14:00–17:00', exact: true }).click();
  expect((await saved).request().postDataJSON()).toEqual({
    preferred_start: '14:00',
    preferred_end: '17:00',
    version: expect.any(Number),
  });
  await expect(page.getByRole('button', { name: 'Wann am liebsten?, 14:00–17:00' })).toBeVisible();
  // What is set survives a reload: it is the server's.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Wann am liebsten?, 14:00–17:00' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Ruhe am Wochenende' })).toBeChecked();
});

test('Aufs Handy: off with one tap, on again only with the parents’ PIN', async ({ page }) => {
  test.setTimeout(240_000);
  await signUpMia(page, freshEmail('settings-contact'));
  await settingsLook(page, SETTINGS_LOOKS[0]);
  await page.getByRole('button', { name: /^Aufs Handy, / }).click();
  let saved = settingsPatch(page);
  await page.getByRole('button', { name: 'Nicht mehr erlauben' }).click();
  expect((await saved).request().postDataJSON()).toEqual({
    contact_enabled: false,
    version: expect.any(Number),
  });
  await expect(page.getByText('Nein. Buddy schreibt dir nur hier in der App.')).toBeVisible();
  await settingsShots(page, 'settings-contact-off');
  // Off: the settings say so, offer the parents' row, and there are no times to set.
  await back(page);
  await expect(page.getByText('Nein – nur hier in der App.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Lernzeiten/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Benachrichtigungen erlauben/ }).scrollIntoViewIfNeeded();
  await settingsShots(page, 'settings-parents-allow');
  await page.goto('/settings/times');
  await expect(page).toHaveURL(/\/settings$/);
  saved = settingsPatch(page);
  await page.getByRole('button', { name: /^Benachrichtigungen erlauben/ }).click();
  await enterPin(page);
  expect((await saved).request().postDataJSON()).toEqual({
    contact_enabled: true,
    version: expect.any(Number),
  });
  await expect(page.getByText(/^Ja – nie nach/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Benachrichtigungen erlauben/ })).toHaveCount(0);
});

test('the parents’ page is closed without the gate, and closes when they leave', async ({
  page,
}) => {
  await signUpMia(page, freshEmail('settings-parents-gate'));
  await page.goto('/settings/parents');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText('Passwort ändern')).toHaveCount(0);
  // A cancelled PIN opens nothing.
  await page.getByRole('button', { name: /^Anmeldung und PIN/ }).click();
  await expect(heading(page, 'PIN der Eltern')).toBeVisible();
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // Opened with the PIN, left, and it is closed again.
  await page.getByRole('button', { name: /^Anmeldung und PIN/ }).click();
  await enterPin(page);
  await expect(page.getByRole('button', { name: 'Passwort ändern' })).toBeVisible();
  await back(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText('Passwort ändern')).toHaveCount(0);
});

test('settings password sheet: shared labels, mismatch and keyboard fit without credential update', async ({
  page,
}) => {
  await signUpMia(page, freshEmail('settings-password-layout'));
  const key = await settingsLook(page, SETTINGS_LOOKS[0]);
  await page.getByRole('button', { name: /^Anmeldung und PIN/ }).click();
  await enterPin(page);
  await page.getByRole('button', { name: 'Passwort ändern', exact: true }).click();
  await enterPin(page);
  const first = page.getByLabel('Neues Passwort', { exact: true });
  const repeat = page.getByLabel('Neues Passwort wiederholen', { exact: true });
  await expect(first).toBeVisible();
  await expect(page.getByText('Mindestens 8 Zeichen.', { exact: true })).toBeVisible();
  await expect(repeat).toBeVisible();
  await first.fill('anderes-passwort-123');
  await repeat.fill('anders');
  await expect(repeat).toBeFocused();
  await expect(
    page.getByText('Die beiden Passwörter sind noch nicht gleich.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Passwort speichern', exact: true }),
  ).toBeDisabled();
  await settingsShots(page, `settings-password-${key}`, true);
  await page.setViewportSize({ width: 360, height: 420 });
  await repeat.click();
  await expect(repeat).toBeInViewport();
  await shot(page, 'settings-password-keyboard', {
    phones: [{ width: 360, height: 420 }],
    opened: true,
  });
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  // Existing provider cannot perform password update here; layout proof never submits.
});

test('the profile correction sheet uses the field’s own labels', async ({ page }) => {
  await signUpMia(page, freshEmail('settings-profile-fix'));
  const key = await settingsLook(page, SETTINGS_LOOKS[0]);
  await page.getByRole('button', { name: /^Anmeldung und PIN/ }).click();
  await enterPin(page);
  await page.getByRole('button', { name: /^Profil korrigieren/ }).click();
  await enterPin(page);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Mia');
  // components/core/Field.jsx: the label is 700 13/18, not a line of body text drawn above.
  for (const label of ['Name', 'Geburtsdatum']) {
    const text = page.locator('[aria-modal="true"]').getByText(label, { exact: true });
    await expect(text).toHaveCSS('font-size', '13px');
    await expect(text).toHaveCSS('font-weight', '700');
  }
  await settingsShots(page, `settings-profile-fix-${key}`, true);
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
});

test('the parents’ PIN fields open on the page and stay whole above the keyboard', async ({
  page,
}) => {
  await signUpMia(page, freshEmail('settings-inline-pin'));
  await settingsLook(page, SETTINGS_LOOKS[0]);
  await page.getByRole('button', { name: /^Anmeldung und PIN/ }).click();
  await enterPin(page);
  await page.getByRole('button', { name: /^PIN ändern/ }).click();
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  await settingsShots(page, 'settings-pin-fields', true);
  await page.setViewportSize({ width: 360, height: 420 });
  const current = page.getByLabel('Aktuelle PIN', { exact: true });
  const next = page.getByLabel('Neue PIN (4 Ziffern)', { exact: true });
  const repeat = page.getByLabel('Neue PIN wiederholen', { exact: true });
  // The settings stay in the stack underneath: the page in front is the last one.
  const list = page.getByTestId('scroll-list').last();
  for (const field of [current, next, repeat]) {
    await field.focus();
    await expect(field).toBeFocused();
    await expect
      .poll(async () => {
        const bounds = await field.boundingBox();
        const clip = await list.boundingBox();
        return (
          bounds !== null &&
          clip !== null &&
          bounds.y >= clip.y &&
          bounds.y + bounds.height <= clip.y + clip.height
        );
      })
      .toBe(true);
  }
  await next.fill('5837');
  await expect(repeat).toBeFocused();
  await expect(next).toHaveValue('5837');
  await repeat.fill('5838');
  await expect(page.getByText('Die beiden PINs sind nicht gleich.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'PIN speichern', exact: true })).toBeDisabled();
  await shot(page, 'settings-inline-pin-keyboard', { phones: [{ width: 360, height: 420 }] });
  // No credentials/PIN are changed by this layout proof.
});

test('Buddys Stimme: a row with the voice she has, and a page with the picker', async ({
  page,
}) => {
  // The dev stack has Buddy's own voices only with LB_DEV_SPEECH=fake (silent audio); without
  // them the app offers no voice to choose (issue #526) — core-loop-settings holds that side.
  test.skip(
    process.env.LB_DEV_SPEECH !== 'fake',
    'the voice page needs voices: run with LB_DEV_SPEECH=fake (docs/architecture.md §Voice)',
  );
  test.setTimeout(300_000);
  // With voices the setup has one more step, so `signUpMia` cannot finish it: the same sign-up
  // by its own steps, each taken when it is there.
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(freshEmail('settings-voice'));
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Mia');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  for (const [label, value] of [
    ['Tag', '14'],
    ['Monat', '03'],
    ['Jahr', '2013'],
  ] as const)
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill(PIN);
  await page.getByLabel('PIN wiederholen').fill(PIN);
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Ja, erlauben' }).click();
  await page.getByRole('button', { name: "Los geht's, Mia!" }).click();
  await expect(page.getByRole('radiogroup', { name: 'Buddys Stimme', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();

  for (const look of SETTINGS_LOOKS.slice(0, 3)) {
    const key = await settingsLook(page, look);
    await page.getByRole('button', { name: 'Buddys Stimme, Warm', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/voice$/);
    await expect(heading(page, 'Buddys Stimme')).toBeVisible();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Warm', exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Hörprobe: Klar', exact: true })).toBeVisible();
    await settingsShots(page, `settings-${key}-voice`);
    await back(page);
  }
  // Picking is the existing versioned save; the row then says the new voice.
  await page.getByRole('button', { name: 'Buddys Stimme, Warm', exact: true }).click();
  const saved = settingsPatch(page);
  await page.getByRole('radio', { name: 'Klar', exact: true }).click();
  expect((await saved).request().postDataJSON()).toEqual({
    voice: expect.any(String),
    version: expect.any(Number),
  });
  await back(page);
  await expect(
    page.getByRole('button', { name: 'Buddys Stimme, Klar', exact: true }),
  ).toBeVisible();
});
