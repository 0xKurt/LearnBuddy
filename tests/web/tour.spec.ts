// Feature tour: every control the other walkthroughs do not tap, tapped once,
// with what it must lead to (the wiring audit, docs/architecture.md §Testing).
// Runs after the other walkthroughs (its scripted model answers come last,
// apps/api/src/testing/scenarios/tour.ts).

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { shot } from './fit';

const FIXTURES = join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures');

async function onboardChild(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('geheim-1234');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'Mein Kind' }).click();
  await page.getByLabel('Wie heißt dein Kind? (Spitzname genügt)').fill('Pia');
  await page.getByLabel('TT').fill('03');
  await page.getByLabel('MM').fill('07');
  await page.getByLabel('JJJJ').fill('2014');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox').click();
  await page.getByLabel('PIN der Eltern').fill('2468');
  await page.getByLabel('PIN wiederholen').fill('2468');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Hallo Pia')).toBeVisible();
}

async function say(page: Page, text: string): Promise<void> {
  await page.getByLabel('Schreib Buddy …').fill(text);
  await page.getByRole('button', { name: 'Senden' }).click();
}

const openMenu = async (page: Page, item: string) => {
  await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await page.getByRole('button', { name: item }).click();
};

test('feature tour: undo, resend, memory, history, settings, parents, photo, explanation', async ({
  page,
}) => {
  const email = `tour-${Date.now()}@example.test`;
  await onboardChild(page, email);

  // ── Undo what Buddy did ──
  await say(page, 'Ich spiele Handball');
  await expect(page.getByText('Cool – Handball merke ich mir.')).toBeVisible();
  const undo = page.getByRole('button', { name: /^Rückgängig machen: / });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(undo).toHaveCount(0);
  // Said in words, not only by colour.
  await expect(page.getByText('Gemerkt: Spielt Handball – rückgängig gemacht')).toBeVisible();
  await shot(page, '40-undone');

  // ── A message that fails is sent again with one tap ──
  await say(page, 'ich mag Katzen');
  const resend = page.getByRole('button', { name: 'Nochmal senden' });
  await expect(resend).toBeVisible();
  await shot(page, '41-failed-message');
  await resend.click();
  await expect(page.getByText('Katzen, schön! Das merke ich mir.')).toBeVisible();
  await expect(resend).toHaveCount(0);

  // ── Earlier messages (the home shows the latest six) ──
  await say(page, 'danke');
  await expect(page.getByText('Gern!')).toBeVisible();
  await say(page, 'tschüss');
  await expect(page.getByText('Bis später!')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ältere Nachrichten' })).toBeVisible();
  await page.getByRole('button', { name: 'Ältere Nachrichten' }).click();
  await expect(page.getByText('Ich spiele Handball')).toBeVisible();
  await shot(page, '42-history');
  await page.getByRole('button', { name: 'Zurück' }).click();

  // ── What Buddy knows: change it, then remove it ──
  await openMenu(page, 'Was Buddy über dich weiß');
  await expect(page.getByText('Mag Katzen', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ändern: Mag Katzen' }).click();
  await page.getByLabel('Was Buddy sich merken soll').fill('Mag Katzen und Hunde');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Mag Katzen und Hunde', { exact: true })).toBeVisible();
  await expect(page.getByText('Von dir geändert.')).toBeVisible();
  await shot(page, '43-memory-edited');
  await page.getByRole('button', { name: 'Entfernen: Mag Katzen und Hunde' }).click();
  await page.getByRole('button', { name: 'Ja, entfernen' }).click();
  await expect(page.getByText('Entfernt. Buddy vergisst das.')).toBeVisible();
  await expect(page.getByText('Mag Katzen und Hunde', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Zurück' }).click();

  // ── Settings: messages to the phone (parents' PIN), times, language ──
  await openMenu(page, 'Einstellungen');
  await page.getByRole('button', { name: 'Darf Buddy dir aufs Handy schreiben?' }).click();
  await expect(page.getByText('Nein. Buddy schreibt dir nur hier in der App.')).toBeVisible();
  await page.getByRole('button', { name: 'Eltern fragen' }).click();
  for (const digit of '2468') await page.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByText('Ja. Buddy darf dir auch aufs Handy schreiben.')).toBeVisible();
  await page.getByRole('button', { name: 'Zeiten anpassen' }).click();
  await expect(page.getByText('Wann nicht?')).toBeVisible();
  await shot(page, '44-settings-times', { opened: true });
  // A pause needs no PIN (less contact is always allowed).
  await page.getByRole('button', { name: 'Bis morgen' }).click();
  await expect(page.getByText(/Pause bis einschließlich/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Nicht mehr erlauben' }).click();
  await expect(page.getByText('Nein. Buddy schreibt dir nur hier in der App.')).toBeVisible();

  await page.getByRole('button', { name: 'Sprache' }).click();
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page.getByText('Settings')).toBeVisible();
  // The group stays open: back in one tap.
  await page.getByRole('radio', { name: 'Deutsch' }).click();
  await expect(page.getByText('Einstellungen')).toBeVisible();

  // ── For parents: after leaving the settings the PIN counts no more ──
  await page.getByRole('button', { name: 'Zurück' }).click();
  await openMenu(page, 'Einstellungen');
  await page.getByRole('button', { name: 'Öffnen', exact: true }).click();
  await expect(page.getByText('Daten exportieren')).toBeVisible();
  await page.getByRole('button', { name: 'Konto löschen …' }).click();
  await page.getByRole('button', { name: 'Ja, in 7 Tagen löschen' }).click();
  // A child's account: the parents' PIN again.
  await expect(page.getByRole('button', { name: '2', exact: true })).toBeVisible();
  for (const digit of '2468') await page.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByText(/Die Löschung ist geplant/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Löschung abbrechen' }).click();
  await expect(page.getByText(/Löschung abgebrochen/)).toBeVisible();
  await shot(page, '45-parents', { opened: true });
  // A new PIN, with the current one.
  await page.getByRole('button', { name: 'PIN ändern' }).click();
  await page.getByLabel('Aktuelle PIN').fill('2468');
  await page.getByLabel('Neue PIN (4 Ziffern)').fill('1357');
  await page.getByLabel('Neue PIN wiederholen').fill('1357');
  await page.getByRole('button', { name: 'PIN speichern' }).click();
  await expect(page.getByText('PIN gespeichert.')).toBeVisible();
  // The export is made (on a phone it opens the share sheet; a browser may not share).
  const exported = page.waitForResponse((r) => r.url().endsWith('/v1/account/export'));
  await page.getByRole('button', { name: 'Export erstellen' }).click();
  expect((await exported).status()).toBe(200);
  await page.getByRole('button', { name: 'Zurück' }).click();

  // ── A sheet Buddy could not read: read again ──
  await page.getByRole('button', { name: 'Arbeitsblatt fotografieren' }).click();
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Aus Fotos wählen' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'sharp.jpg'));
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Das Blatt konnte ich nicht lesen')).toBeVisible({ timeout: 30_000 });
  await shot(page, '50-sheet-unreadable');
  await page.getByRole('button', { name: 'Nochmal lesen' }).click();
  await expect(page.getByText('Das Blatt konnte ich nicht lesen')).toHaveCount(0, {
    timeout: 30_000,
  });
  // Read now, and a practice made from its one question: "1 Aufgabe", not "1 Aufgaben".
  await expect(page.getByText(/^1 Aufgabe · ca\. \d+ Min\.$/)).toBeVisible({ timeout: 15_000 });
  // "Heute nicht": the practice steps aside without a trace of pressure.
  await page.getByRole('button', { name: 'Heute nicht' }).click();
  await expect(page.getByText('Übung bereit: Nomen und Verben')).toHaveCount(0);
  await openMenu(page, 'Mein Stoff');
  await expect(page.getByText('Nomen und Verben').last()).toBeVisible();
  // A page she forgot can be added to the sheet.
  await page.getByRole('button', { name: /^Fragen .*Nomen und Verben/ }).click();
  await page.getByRole('button', { name: 'Seite hinzufügen' }).click();
  await expect(page.getByText('Die Fragen dazu kommen zu diesem Blatt.')).toBeVisible();
  await page.getByRole('button', { name: 'Zurück' }).click();
  await page.getByRole('button', { name: 'Zurück' }).click();
  await page.getByRole('button', { name: 'Zurück' }).click();

  // ── Homework of two pages, the second cut off: Lena is told, and takes just that page again ──
  await page.getByRole('button', { name: 'Hausaufgabe', exact: true }).click();
  await page.getByRole('button', { name: 'Aufgabe fotografieren' }).click();
  await expect(page.getByText('Fotografier deine Hausaufgabe')).toBeVisible();
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'sharp.jpg'));
  // The sample photo is small for a phone photo: kept anyway.
  await page.getByRole('button', { name: 'Trotzdem behalten' }).click();
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Noch ein Foto' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'sharp.jpg'));
  await expect(page.getByRole('img', { name: 'Foto 2 von 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Trotzdem behalten' }).click();
  await page.getByRole('button', { name: 'Senden' }).click();
  // Before the help session: what is missing, while the sheet is still at hand.
  await expect(page.getByText('Eine Seite konnte ich nicht ganz lesen')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Seite 2: ein Stück ist abgeschnitten')).toBeVisible();
  await expect(page.getByText('Alles andere von „Hausaufgabe Quadrat“ ist fertig.')).toBeVisible();
  await shot(page, '52-page-missing');
  await page.getByRole('button', { name: 'Nochmal fotografieren' }).click();
  await expect(page.getByText('Seite 2 nochmal')).toBeVisible();
  await shot(page, '53-page-again');
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'sharp.jpg'));
  await page.getByRole('button', { name: 'Senden' }).click();
  // The notice is answered; once page 2 is read, its task joins the same help session.
  await expect(page.getByText('Eine Seite konnte ich nicht ganz lesen')).toHaveCount(0);
  await expect(page.getByText('Hausaufgabe Quadrat – noch 2 Aufgaben')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Weitermachen' }).click();
  await expect(page.getByText('Ein Quadrat hat 4 cm Seitenlänge.', { exact: false })).toBeVisible();
  await expect(page.getByText('Frage 1 von 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lösung zeigen' })).toHaveCount(0);
  await shot(page, '51-homework-photo');
  await page.getByRole('button', { name: 'Übung beenden' }).click();

  // ── A hard-to-read photo kept anyway ──
  await page.getByRole('button', { name: 'Arbeitsblatt fotografieren' }).click();
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await (await chooser).setFiles(join(FIXTURES, 'dark.jpg'));
  await expect(page.getByText('Foto 1 ist zu dunkel.')).toBeVisible();
  await page.getByRole('button', { name: 'Trotzdem behalten' }).click();
  await expect(page.getByText('Foto 1 ist zu dunkel.')).toHaveCount(0);
  await expect(page.getByText('Schwer lesbar')).toBeVisible();
  await shot(page, '46-photo-kept');
  await page.getByRole('button', { name: 'Zurück' }).click();

  // ── Not sent, and the app is closed: the photo waits on home, survives a restart ──
  await expect(page.getByText('Deine Fotos sind noch nicht gesendet')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Deine Fotos sind noch nicht gesendet')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('1 Foto von vorhin wartet.')).toBeVisible();
  await shot(page, '47-photos-waiting');
  // Let go, and brought back.
  await page.getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page.getByText('Foto verworfen.')).toBeVisible();
  await page.getByRole('button', { name: 'Verworfene Fotos zurückholen' }).click();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  // The same photo, still marked and still kept (no second question about it).
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await expect(page.getByText('Schwer lesbar')).toBeVisible();
  await expect(page.getByText('Foto 1 ist zu dunkel.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Entfernen' }).click();
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('Deine Fotos sind noch nicht gesendet')).toHaveCount(0);

  // ── An explanation read again from the questions ──
  await page.getByRole('button', { name: 'Erklär mir was', exact: true }).click();
  await page.getByRole('textbox').last().fill('Nomen');
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('Nomen sind Namen für Dinge', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Verstanden – frag mich!' }).click();
  await expect(page.getByText('Welches Wort ist ein Nomen?')).toBeVisible();
  await page.getByRole('button', { name: 'Erklärung nochmal lesen' }).click();
  await expect(page.getByText('Die Erklärung')).toBeVisible();
  await shot(page, '47-explanation-again');
  await page.getByRole('button', { name: 'Schließen' }).last().click();
  await page.getByRole('button', { name: 'Hund', exact: true }).click();
  await expect(page.getByText('Stimmt – gut gemacht!')).toBeVisible();
  await page.getByRole('button', { name: 'Übung beenden' }).click();

  // ── Pronunciation: record (a fake microphone), sent, feedback per word ──
  await page.getByRole('button', { name: 'Aussprache', exact: true }).click();
  await page.getByRole('textbox').last().fill('Englisch: The weather is nice today.');
  await page.getByRole('button', { name: "Los geht's" }).last().click();
  await expect(page.getByText('The weather is nice today.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Aufnahme starten' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Aufnahme beenden und an Buddy schicken' }).click();
  await expect(page.getByText('Fast – achte auf: weather')).toBeVisible();
  await expect(page.getByText(/Zunge zwischen den Zähnen/)).toBeVisible();
  await shot(page, '49-speak-feedback');
  await page.getByRole('button', { name: 'Übung beenden' }).click();

  // ── Signing out, and the password link that no longer works ──
  await openMenu(page, 'Einstellungen');
  await page.getByRole('button', { name: 'Öffnen', exact: true }).click();
  await page.getByRole('button', { name: 'Abmelden' }).last().click();
  await page.getByRole('button', { name: 'Ja, abmelden' }).click();
  await expect(page.getByRole('button', { name: 'Konto erstellen' })).toBeVisible();
  // Signed out for good: a reload does not bring the session back.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Konto erstellen' })).toBeVisible();
  await page.goto('/reset-password');
  await expect(page.getByText('Dieser Link gilt nicht mehr')).toBeVisible();
  await shot(page, '48-reset-link-invalid');
  await page.getByRole('button', { name: 'Zurück zur Anmeldung' }).click();
  await expect(page.getByRole('button', { name: 'Konto erstellen' })).toBeVisible();
  // "Passwort vergessen?": the same answer whether the address has an account or not.
  await page.getByRole('radio', { name: 'Anmelden' }).click();
  await page.getByLabel('E-Mail').fill(email);
  await page.getByRole('button', { name: 'Passwort vergessen?' }).click();
  await expect(page.getByText(/Wenn es ein Konto mit dieser Adresse gibt/)).toBeVisible();
});
