// Browser walkthrough of a roleplay in a foreign language (issue #244), against the real API
// with the scripted model (apps/api/src/testing/scenarios/roleplay.ts): asked for in the chat,
// the role card, a line in English, a line in German (the app's own hint), a line by voice in
// the conversation mode, her tap on "end" and the feedback per key point — no new screen.
// Shots at both phone sizes, light and dark (tests/web/fit.ts).

import apiDe from '../../apps/api/src/i18n/de.json';
import buddyDe from '../../apps/mobile/locales/de/buddy.json';
import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';
import { voiceAsSilence } from './talk';

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`roleplay-${Date.now()}@example.test`);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Lena');
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('10');
  await page.getByLabel('Monat', { exact: true }).fill('02');
  await page.getByLabel('Jahr', { exact: true }).fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: 'Weiter' }).click();
  // Notifications are asked of the adults right after their PIN (issue #518).
  await page.getByRole('button', { name: 'Nein, danke' }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

async function send(page: Page, text: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(text);
  await page.getByRole('button', { name: 'Senden' }).click();
}

async function setDark(page: Page, dark: boolean): Promise<void> {
  await page.getByRole('button', { name: 'Mehr' }).click();
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('radio', { name: dark ? 'Dunkel' : 'Hell', exact: true }).click();
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

test('roleplay: in the chat, in the role, by voice, and feedback per key point', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await onboardChild(page);

  // ── Asked for in the chat: the role card stands under Buddy's first line ──
  await send(page, 'Lass uns ein Rollenspiel auf Englisch machen, ich bin im Café');
  // The thread's one card (#599, design components/practice/Modes.jsx:20–31): what it is, the
  // scene, who Buddy plays, her tasks, and the way into the spoken scene.
  await expect(page.getByText('Englisch · Rollenspiel', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Im Café in London' })).toBeVisible();
  await expect(page.getByText('Kellner', { exact: true })).toBeVisible();
  await expect(page.getByText('Nach dem Preis fragen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gespräch starten' })).toHaveCount(1);
  // The way out is pinned above the conversation, where it stays when the card has scrolled
  // away with the scene — one button, not one on the card as well.
  const end = page.getByRole('button', { name: "Beenden – wie lief's?" });
  await expect(end).toHaveCount(1);
  await expect(page.getByTestId('roleplay-strip')).toBeVisible();
  await shot(page, '40-roleplay-card');
  // What runs stays whole on its one line at 360 too, beside the round ✕ (issue #334.3).
  await page.setViewportSize({ width: 360, height: 740 });
  const what = page.getByTestId('roleplay-strip').getByText('Rollenspiel · Im Café in London');
  await expect(what).toBeVisible();
  expect(await what.evaluate((el) => el.scrollWidth <= el.clientWidth), 'not cut').toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });

  // ── A line in English: Buddy answers in the role ──
  await send(page, 'Hello! A hot chocolate, please.');
  await expect(page.getByText('Would you like a piece of cake with it?')).toBeVisible();
  await shot(page, '41-roleplay-line');

  // The chat mic and message playback use the same scene language as conversation mode (#918).
  const dictated = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/v1/voice/transcribe'),
  );
  await page.getByRole('button', { name: 'Nachricht sprechen', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Aufnahme stoppen', exact: true }).click();
  expect((await dictated).postDataJSON()).toMatchObject({ lang: 'en' });
  await expect(page.getByLabel('Schreib Buddy …')).toHaveValue('How much it costs?');
  await page.getByLabel('Schreib Buddy …').fill('');
  await voiceAsSilence(page, 10_000);
  for (const dark of [false, true]) {
    await setDark(page, dark);
    const line = page.getByText('Would you like a piece of cake with it?', { exact: false }).last();
    const box = await line.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    const menu = page.locator('[aria-modal="true"]');
    await expect(menu.getByRole('heading', { name: 'Buddys Nachricht' })).toBeVisible();
    const played = page.waitForRequest(
      (r) => r.method() === 'GET' && r.url().endsWith('/v1/voice/speech'),
    );
    await menu.getByRole('button', { name: 'Anhören', exact: true }).click();
    expect(
      JSON.parse(decodeURIComponent((await played).headers()['x-speech-request']!)),
    ).toMatchObject({ locale: expect.stringMatching(/^en-/) });
    await expect(menu.getByRole('button', { name: 'Anhalten', exact: true })).toBeVisible();
    await menu.getByRole('button', { name: 'Anhalten', exact: true }).click();
    const slowed = page.waitForRequest(
      (r) => r.method() === 'GET' && r.url().endsWith('/v1/voice/speech'),
    );
    await menu.getByRole('button', { name: 'Langsam anhören', exact: true }).click();
    expect(
      JSON.parse(decodeURIComponent((await slowed).headers()['x-speech-request']!)),
    ).toMatchObject({
      locale: expect.stringMatching(/^en-/),
      slow: true,
    });
    await shot(page, `41b-roleplay-message-${dark ? 'dark' : 'light'}`, { opened: true });
    await menu.getByRole('button', { name: 'Anhalten', exact: true }).click();
    await menu.getByRole('button', { name: 'Schließen', exact: true }).click();
  }

  // ── A line in German: the app's own hint, the model's words are not shown ──
  await send(page, 'Was kostet das?');
  await expect(page.getByText(/Versuch's auf Englisch/)).toBeVisible();
  await expect(page.getByText('It is three pounds fifty.')).toHaveCount(0);
  await setDark(page, true);
  await shot(page, '42-roleplay-hint-dark');

  // ── By voice in the conversation mode: it listens in English while the scene runs ──
  // The conversation screen is the live scene now (ui_kits/app/Extra.jsx:186–205): its name on
  // top, who Buddy plays, the lines as bubbles, and its own way to end it.
  await page.getByRole('button', { name: 'Mit Buddy sprechen' }).click();
  await expect(page.getByText(buddyDe.talk.tap_when_done)).toBeVisible();
  await expect(page.getByText('Buddy spielt: Kellner')).toBeVisible();
  await expect(page.getByText('Englisch · Rollenspiel', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gespräch beenden' })).toHaveCount(1);
  const transcribed = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/v1/voice/transcribe'),
  );
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Aufnahme stoppen' }).click();
  const req = await transcribed;
  expect(req.postData() ?? '').toContain('"lang":"en"');
  await expect(page.getByText('How much it costs?').last()).toBeVisible();
  await expect(
    page.getByText('That is three pounds fifty, please. Anything else?').last(),
  ).toBeVisible();
  await shot(page, '43-roleplay-talk-dark');
  await page.getByRole('button', { name: 'Beenden', exact: true }).last().click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();

  // ── Her tap on "end": feedback per key point, with her own words, no grade ──
  await expect(page.getByTestId('roleplay-strip')).toBeVisible();
  await shot(page, '43b-roleplay-strip-dark');
  // The card has scrolled away by now; the strip carries the way out.
  await page.getByTestId('roleplay-strip').getByRole('button').click();
  // The one result card (issue #384, #599), from the structured feedback — not the text: a tick
  // for what she managed, and one box for next time.
  await expect(page.getByRole('heading', { name: "So lief's" })).toBeVisible();
  await expect(page.getByText('„Hello“', { exact: true })).toBeVisible();
  await expect(page.getByText('Nach dem Preis fragen', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Noch nicht dabei', { exact: true })).toBeVisible();
  await expect(page.getByTestId('mode-result-next').getByText('Nächstes Mal')).toBeVisible();
  await expect(page.getByText('„How much it costs?“', { exact: true })).toBeVisible();
  await expect(page.getByText('„How much does it cost?“', { exact: true })).toBeVisible();
  // The invented quote is not shown, and the text is not shown beside the card.
  await expect(page.getByText(/What is the price/)).toHaveCount(0);
  await expect(page.getByText(/so lief es:/)).toHaveCount(0);
  // Over: the strip with the way out is gone (the card above has scrolled away with the scene).
  await expect(page.getByTestId('roleplay-strip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Beenden – wie lief's?" })).toHaveCount(0);
  await shot(page, '44-roleplay-feedback-dark');
  await setDark(page, false);
  await shot(page, '45-roleplay-feedback');
});

test('roleplay: distress inside the scene gets the fixed help answer, shown whole', async ({
  page,
}) => {
  await onboardChild(page);
  await send(page, 'Lass uns ein Rollenspiel auf Englisch machen, ich bin im Café');
  await expect(page.getByTestId('roleplay-strip')).toBeVisible();

  // Her words inside the running scene are a concern (CLAUDE.md rule 18): the scene ends, and
  // the answer is the server's fixed one with the number — never the model's words, no feedback.
  // `DISTRESS_TEXT` of apps/api/src/testing/scenarios/safeguarding.ts, scripted as a concern there.
  await send(page, 'In der Schule werde ich jeden Tag gehauen');
  const help = page.getByText(apiDe.safeguarding.concern, { exact: true }).last();
  for (const phone of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(phone);
    await expect(help, `the help answer at ${phone.width}`).toBeInViewport({ ratio: 1 });
    await expect(help).toContainText('116 111');
  }
  await expect(page.getByTestId('roleplay-strip')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: "So lief's" })).toHaveCount(0);
  // The role card says it is over, and points to no feedback (#599); never why.
  await expect(page.getByText(buddyDe.roleplay.ended_quiet, { exact: true })).toBeVisible();
  await expect(page.getByText(buddyDe.roleplay.ended, { exact: true })).toHaveCount(0);
  await shot(page, '46-roleplay-concern');
});
