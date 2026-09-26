// Browser walkthrough of the core loop in the real app (web build) against
// the dev stack (real API, scheduler and schema; scripted model answers from
// apps/api/src/testing/scenarios/core-loop.ts). Screenshots go to
// test-results/web/shots for a visual check.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { SHOTS, shot } from './fit';

mkdirSync(SHOTS, { recursive: true });

/** The app scrolls inside its own views: a tall window shows a whole screen. */
/** A photographed "worksheet", rendered by the browser itself. */
async function worksheetJpeg(page: Page, path: string): Promise<void> {
  const sheet = await page.context().newPage();
  await sheet.setViewportSize({ width: 800, height: 1000 });
  await sheet.setContent(`
    <body style="font-family: Georgia, serif; padding: 48px; background: #fffef8">
      <h1>Brüche – Übungsblatt</h1>
      <ol style="font-size: 26px; line-height: 2">
        <li>Kürze 6/8.</li>
        <li>Welcher Bruch ist größer: 2/3 oder 3/5?</li>
        <li>Wie heißt die Zahl unter dem Bruchstrich?</li>
        <li>Warum bleibt der Wert beim Erweitern gleich?</li>
      </ol>
    </body>`);
  await sheet.screenshot({ path, type: 'jpeg', quality: 80 });
  await sheet.close();
}

test('core loop: a parent sets up, the student plans a test → photo → prepared practice → feedback remembered', async ({
  page,
}) => {
  const email = `walkthrough-${Date.now()}@example.test`;
  const pin = '4826';

  // ── A parent sets up the account for a 7th grader ──
  await page.goto('/');
  await expect(page.getByText('Dein Lernbuddy für Arbeiten und Tests.')).toBeVisible();
  await shot(page, '01-welcome');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
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
  await page.getByLabel('TT').fill('14');
  await page.getByLabel('MM').fill('03');
  await page.getByLabel('JJJJ').fill('2013');
  await shot(page, '03a-profile-child');
  // For a child two short steps (each fits the screen): the child, then the parents.
  await page.getByRole('button', { name: 'Weiter' }).click();
  const start = page.getByRole('button', { name: "Los geht's" });
  await expect(start).toBeDisabled(); // consent and PIN still missing
  await page.getByRole('checkbox').click();
  await page.getByLabel('PIN der Eltern').fill(pin);
  await page.getByLabel('PIN wiederholen').fill(pin);
  await shot(page, '03-profile-child');
  await start.click();

  // ── The student's first look: who Buddy is and how to start ──
  await expect(page.getByText('Hallo Mia')).toBeVisible();
  await expect(
    page.getByText('Ich helfe dir, dich auf Arbeiten und Tests vorzubereiten', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arbeit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arbeitsblatt fotografieren' })).toBeVisible();
  await shot(page, '04-buddy-first-visit');

  // ── Get to know: the test, and what Buddy needs for it ──
  await page
    .getByLabel('Schreib Buddy …')
    .fill('Ich schreibe am Freitag eine Mathearbeit über Brüche.');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByText('Super, dann bereiten wir uns bis Freitag zusammen vor.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/Eingetragen: Mathearbeit Brüche am/)).toBeVisible();
  await expect(page.getByText('Schick mir ein Foto')).toBeVisible();
  await expect(page.getByText('Darf ich dir aufs Handy schreiben?')).toBeVisible();
  await expect(page.getByText('Das müssen deine Eltern erlauben.')).toBeVisible();
  await shot(page, '05-buddy-planned');

  // ── Messages to the phone need a parent: the PIN, not the student ──
  await page.getByRole('button', { name: 'Eltern fragen' }).click();
  await expect(page.getByText('PIN der Eltern')).toBeVisible();
  await shot(page, '06-parent-pin');
  for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByText('Hallo Mia')).toBeVisible();
  await expect(page.getByText('Darf ich dir aufs Handy schreiben?')).toBeHidden();

  // ── The worksheet: photographed, sent, read in the background ──
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await expect(page.getByText('Fotografier dein Blatt')).toBeVisible();
  await shot(page, '07-capture-empty');
  const photo = join(SHOTS, '..', 'worksheet.jpg');
  await worksheetJpeg(page, photo);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await (await chooser).setFiles(photo);
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await shot(page, '08-capture-photo');
  await page.getByRole('button', { name: 'Senden' }).click();

  // ── Buddy acts on it by itself: reads it, prepares practice, says so ──
  // Here in the app the card says it now; the message about it is planned for Mia's preferred
  // time and visible as planned — and dropped once she has practised.
  await expect(page.getByText(/Übung bereit: /)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/4 Aufgaben · ca\. 5 Min\./)).toBeVisible();
  await shot(page, '09-buddy-prepared');

  // ── The useful result: short practice, checked, with calm feedback ──
  await page.getByRole('button', { name: 'Jetzt üben' }).click();
  const answers: Array<{ prompt: string; answer: string; choice?: true }> = [
    { prompt: 'Kürze 6/8 und gib das Ergebnis als Dezimalzahl an.', answer: '0,75' },
    { prompt: 'Welcher Bruch ist größer?', answer: '2/3', choice: true },
    { prompt: 'Wie heißt die Zahl unter dem Bruchstrich?', answer: 'Nenner' },
    {
      prompt: 'Warum multipliziert man beim Erweitern Zähler und Nenner mit derselben Zahl?',
      answer: 'Damit der Wert gleich bleibt.',
    },
  ];
  for (let n = 1; n <= answers.length; n++) {
    await expect(page.getByText(`Frage ${n} von ${answers.length}`)).toBeVisible();
    let current: (typeof answers)[number] | undefined;
    for (const a of answers)
      if (await page.getByText(a.prompt, { exact: true }).isVisible()) current = a;
    if (!current) throw new Error(`no known question on screen (question ${n})`);
    if (current.choice) {
      await page.getByRole('button', { name: current.answer, exact: true }).click();
    } else {
      await page.getByLabel('Deine Antwort').fill(current.answer);
      await page.getByRole('button', { name: 'Prüfen' }).click();
    }
    await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
    if (n === 1 || current.choice) await shot(page, `10-practice-q${n}`);
    await page.getByRole('button', { name: 'Weiter' }).click();
  }
  await expect(page.getByText('Auf Anhieb richtig')).toBeVisible();
  await shot(page, '11-practice-summary');
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Feedback understood, behaviour adapted ──
  await expect(page.getByText('Hallo Mia')).toBeVisible();
  await page.getByLabel('Schreib Buddy …').fill('Mach die Übungen bitte kürzer.');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Mach ich – ab jetzt kurze Runden.')).toBeVisible();
  await expect(page.getByText('Gemerkt: Möchte kurze Übungen')).toBeVisible();
  await shot(page, '12-buddy-feedback');

  // ── Secondary, but one tap away: what Buddy knows, the sheets, the settings ──
  const openMenu = async (item: string) => {
    await page.getByRole('button', { name: 'Menü öffnen' }).click();
    await page.getByRole('button', { name: item }).click();
  };
  await openMenu('Was Buddy über dich weiß');
  await expect(page.getByText('Möchte kurze Übungen', { exact: true })).toBeVisible();
  await expect(page.getByText('Du hast gesagt: „bitte kürzer“')).toBeVisible();
  await shot(page, '13-memory');
  await page.getByRole('button', { name: 'Zurück' }).click();

  await openMenu('Mein Stoff');
  await expect(page.getByText('Brüche kürzen und vergleichen')).toBeVisible();
  await expect(page.getByText(/· 4 Aufgaben$/)).toBeVisible();
  await shot(page, '14-library');

  // The questions made from the sheet, renaming it, taking out one question.
  await page
    .getByRole('button', { name: 'Fragen aus „Brüche kürzen und vergleichen“ ansehen' })
    .click();
  await expect(page.getByText('Welcher Bruch ist größer?')).toBeVisible();
  await expect(page.getByText('Auf Anhieb gewusst').first()).toBeVisible();
  await page.getByRole('button', { name: '„Brüche kürzen und vergleichen“ umbenennen' }).click();
  await page.getByLabel('Name des Blatts').fill('Brüche – Test Freitag');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Umbenannt.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Brüche – Test Freitag' })).toBeVisible();
  await page.getByRole('button', { name: 'Frage 4 löschen' }).click();
  await page.getByRole('button', { name: 'Löschen', exact: true }).last().click();
  await expect(page.getByText('Frage gelöscht.')).toBeVisible();
  await expect(page.getByText('Warum multipliziert man beim Erweitern')).toHaveCount(0);
  await shot(page, '16-material-questions');
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText(/· 3 Aufgaben$/)).toBeVisible();
  await page.getByRole('button', { name: 'Zurück' }).click();

  await openMenu('Einstellungen');
  await expect(page.getByText('Darf Buddy dir aufs Handy schreiben?')).toBeVisible();
  await expect(page.getByText('Für Eltern')).toBeVisible();
  await shot(page, '15-settings');
  // Every group is closed with what is set now; one tap opens it.
  await page.getByRole('button', { name: 'Darf Buddy dir aufs Handy schreiben?' }).click();
  await expect(page.getByRole('button', { name: 'Nicht mehr erlauben' })).toBeVisible();
  await shot(page, '15b-settings-contact', { opened: true });
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('Hallo Mia')).toBeVisible();

  test.info().annotations.push({ type: 'email', description: email });
});
