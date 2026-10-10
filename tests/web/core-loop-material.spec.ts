// Core loop, part 4 of 5 (issue #381): one tap away from Buddy — what he knows about her and
// "Dein Material" (subjects, a sheet's questions, renaming, deleting one), and a subject that is
// empty or gone. Starts from a fresh learner who planned a test, sent a worksheet, practised and
// asked for shorter rounds (coreLoop.ts; parts 2 and 3 check that way).

import { expect, test } from '@playwright/test';

import {
  askShorter,
  freshEmail,
  openMenu as openMenuOf,
  planTest,
  practise,
  sendWorksheet,
  signUpMia,
} from './coreLoop';
import { shot } from './fit';

test('core loop · material: what Buddy knows, the sheets, a subject empty or gone', async ({
  page,
}) => {
  const email = freshEmail('material');
  await signUpMia(page, email);
  await planTest(page);
  await sendWorksheet(page);
  await practise(page);
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
  await askShorter(page);

  // ── Secondary, but one tap away: what Buddy knows, the sheets, the settings ──
  const openMenu = (item: string) => openMenuOf(page, item);
  await openMenu('Was Buddy über dich weiß');
  await expect(page.getByText('Möchte kurze Übungen', { exact: true })).toBeVisible();
  await expect(page.getByText('Du hast gesagt: „bitte kürzer“')).toBeVisible();
  await shot(page, '13-memory');
  await page.getByRole('button', { name: 'Zurück' }).click();

  // "Dein Material" in two levels (issue #189): her subjects first — what there is, named,
  // never counted (rule 6) — and one tap into Mathe for the sheets themselves.
  await openMenu('Dein Material');
  await expect(page.getByRole('heading', { name: 'Dein Material' })).toBeVisible();
  const mathe = page.getByRole('button', { name: /^Mathe: / });
  await expect(mathe).toBeVisible();
  // The glimpse NAMES what is in there instead of saying how many there are.
  await expect(mathe).toHaveAccessibleName(/Brüche/);
  await shot(page, '14-library');
  await mathe.click();
  await expect(page.getByRole('heading', { name: 'Mathe' })).toBeVisible();
  await expect(page.getByText('Brüche kürzen und vergleichen').last()).toBeVisible();
  await expect(page.getByText(/· 4 Aufgaben$/)).toBeVisible();
  // What came up in this subject, to look up — no result and no progress next to it.
  await expect(page.getByText('Darum ging es')).toBeVisible();
  await shot(page, '14b-subject');

  // The questions made from the sheet, renaming it, taking out one question.
  await page
    .getByRole('button', { name: 'Fragen aus „Brüche kürzen und vergleichen“ ansehen' })
    .click();
  await expect(page.getByText(/^Welcher Bruch ist größer:/).first()).toBeVisible();
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
  // Out of the subject, out of "Dein Material", back to Buddy.
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByRole('heading', { name: 'Dein Material' })).toBeVisible();
  await page.getByRole('button', { name: 'Zurück' }).click();

  // ── A subject with nothing in it says so, and one that is gone offers the way back ──
  // (issue #189, rule 12: never an empty screen and never "kommt später". Both are reached
  // by their own address, because that is how they happen — she is inside a subject when the
  // last sheet in it goes.)
  await page.goto('/subject/unsorted');
  await expect(page.getByText('Hier ist gerade nichts')).toBeVisible();
  await shot(page, '17-subject-empty');
  await page.goto('/subject/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText('Das Fach ist nicht mehr da')).toBeVisible();
  await shot(page, '17b-subject-gone');
  await page.getByRole('button', { name: 'Zu deinem Material' }).click();
  await expect(page.getByRole('heading', { name: 'Dein Material' })).toBeVisible();

  test.info().annotations.push({ type: 'email', description: email });
});
