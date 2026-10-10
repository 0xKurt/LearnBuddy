// Core loop, part 1 of 5 (issue #381; the old core-loop.spec.ts was split so each part runs well
// under the limit and brings its own learner, Engineering-Regel 7): a parent sets up the account,
// the phone goes to Mia, she picks Buddy's voice and her colours, and sees Buddy's home for the
// first time. Real app (web build) against the dev stack; scripted model
// (apps/api/src/testing/scenarios/core-loop.ts). Shots go to test-results/web/shots.

import { expect, test } from '@playwright/test';

import { freshEmail, PIN } from './coreLoop';
import { partHeight, shot } from './fit';

test('core loop · setup: a parent sets up, Mia picks voice and colours, first look at Buddy', async ({
  page,
}) => {
  const email = freshEmail('setup');
  const pin = PIN;

  // ── A parent sets up the account for a 7th grader ──
  await page.goto('/');
  await expect(page.getByText('Dein Lernbuddy für Arbeiten und Tests.')).toBeVisible();
  await shot(page, '01-welcome');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByLabel('Passwort wiederholen').fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();

  await expect(page.getByText('Kurz zum Datenschutz')).toBeVisible();
  await shot(page, '02-consent');
  const accept = page.getByRole('button', { name: 'Weiter' });
  await expect(accept).toBeDisabled();
  await page.getByRole('checkbox').click();
  await accept.click();

  await expect(page.getByText('Wer lernt mit LearnBuddy?')).toBeVisible();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Mia');
  // The Bundesland is a required field at registration (issue #199): one row that opens
  // a sheet with the sixteen; without a choice the CTA stays muted.
  await page.getByRole('button', { name: 'Bundesland wählen' }).click();
  await page.getByRole('radio', { name: 'Niedersachsen' }).click();
  await page.getByLabel('Tag', { exact: true }).fill('14');
  await page.getByLabel('Monat', { exact: true }).fill('03');
  await page.getByLabel('Jahr', { exact: true }).fill('2013');
  await shot(page, '03a-profile-child');
  // For a child two short steps (each fits the screen): the child, then the parents.
  await page.getByRole('button', { name: 'Weiter' }).click();
  const start = page.getByRole('button', { name: "Los geht's" });
  await expect(start).toBeDisabled(); // consent and PIN still missing
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill(pin);
  await page.getByLabel('PIN wiederholen').fill(pin);
  await shot(page, '03-profile-child');
  await start.click();

  // ── The hand-over: what is set now, and the phone goes to Mia (user feedback #10) ──
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await expect(page.getByText('PIN der Eltern: gesetzt – nur ihr kennt sie')).toBeVisible();
  await expect(page.getByText(/Push-Benachrichtigungen: aus/)).toBeVisible();
  await shot(page, '03b-handover');
  await page.getByRole('button', { name: "Los geht's, Mia!" }).click();

  // ── Mia picks how Buddy sounds: a voice is already chosen, a tap plays and picks one ──
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  const picked = page.waitForResponse(
    (r) => r.url().endsWith('/buddy/settings') && r.request().method() === 'PATCH' && r.ok(),
  );
  // "Hell" here is one of Buddy's VOICES (warm · freundlich · hell · klar), not the theme.
  await page.getByRole('radio', { name: 'Hell' }).click();
  await picked;
  // The walkthrough runs without Buddy's own voice: the phone reads the sample, and says so.
  await expect(page.getByText(/Gerade liest die Stimme deines Handys vor/)).toBeVisible();
  await shot(page, '03c-voice');
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── The first-start cards, then the home ──
  await expect(page.getByText('Sag es Buddy einfach')).toBeVisible();
  await shot(page, '03d-onboarding');
  // Walk to the last card: the colours are chosen here now, not three taps deep in the
  // settings (issue #136), and every card has to fit without scrolling (rule 16).
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.getByText('Such dir deine Farben aus')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Meer' })).toBeVisible();
  // The same two controls as in the settings (issue #172): colour cards and one switch, named
  // for what it does — "Dunkelmodus", on = dark, the name the same either way (#517).
  const dark = page.getByRole('switch', { name: 'Dunkelmodus' });
  await expect(dark).not.toBeChecked();
  await expect(page.getByText('Folgt dem Handy, bis du es hier einmal einstellst.')).toBeVisible();
  await shot(page, '03e-onboarding-look');
  await page.getByRole('radio', { name: 'Abend' }).click();
  await expect(page.getByRole('radio', { name: 'Abend' })).toHaveAttribute('aria-checked', 'true');
  await shot(page, '03f-onboarding-look-sunset');
  await dark.click();
  await expect(dark).toBeChecked();
  await expect(page.getByText('Lange drücken, um wieder dem Handy zu folgen.')).toBeVisible();
  await shot(page, '03g-onboarding-look-dark');
  // The way back to the phone (#222): a long press on the row, as its hint says.
  await page.getByText('Dunkelmodus', { exact: true }).click({ delay: 900 });
  await expect(dark).not.toBeChecked();
  await expect(page.getByText('Folgt dem Handy, bis du es hier einmal einstellst.')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's" }).click();

  // ── The student's first look: who Buddy is and how to start ──
  await expect(page.getByText('LearnBuddy')).toBeVisible();
  await expect(
    page.getByText('Ich helfe dir, dich auf Arbeiten und Tests vorzubereiten', { exact: false }),
  ).toBeVisible();
  // The ways to start live in ⋯ since #174; the head carries Buddy, his name and that one way.
  await expect(page.getByRole('button', { name: 'Mehr', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Was möchtest du anhängen?' })).toBeVisible();
  await shot(page, '04-buddy-first-visit');
  // What the head and the bar take on the smallest phone: the rest is conversation (#64).
  await page.setViewportSize({ width: 360, height: 740 });
  const head = await partHeight(page, 'home-header', 'home');
  const bar = await partHeight(page, 'composer', 'home');
  console.log(`HOME 360x740: header ${head}pt, composer ${bar}pt`);
  // Measured 29.09.: 52 pt head, 68 pt bar — 16 % of a 740 pt phone. The head is the mark
  // alone since 30.09. (#125, #135), so this has room; the bound is what we keep, not what
  // we hope for.
  expect(head + bar, `head ${head}pt + composer ${bar}pt`).toBeLessThanOrEqual(160);
  await page.setViewportSize({ width: 390, height: 844 });

  // ── Nothing photographed yet: "Dein Material" says where her sheets will land (#189) ──
  await page.getByRole('button', { name: 'Mehr', exact: true }).click();
  await page.getByRole('button', { name: 'Dein Material' }).click();
  await expect(page.getByRole('heading', { name: 'Dein Material' })).toBeVisible();
  await expect(page.getByText('Hier landen deine Blätter')).toBeVisible();
  await shot(page, '04b-material-empty');
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();

  test.info().annotations.push({ type: 'email', description: email });
});
