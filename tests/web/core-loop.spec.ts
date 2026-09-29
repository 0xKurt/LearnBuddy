// Browser walkthrough of the core loop in the real app (web build) against
// the dev stack (real API, scheduler and schema; scripted model answers from
// apps/api/src/testing/scenarios/core-loop.ts). Screenshots go to
// test-results/web/shots for a visual check.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { partHeight, SHOTS, shot } from './fit';
import { recordPerf } from './perf';

mkdirSync(SHOTS, { recursive: true });

/** The app scrolls inside its own views: a tall window shows a whole screen. */
/** A photographed "worksheet", rendered by the browser itself. */
/** Where the menu, the greeting and the ways to start stand on Buddy's home (card or not). */
async function homePositions(page: Page): Promise<number[]> {
  const ys: number[] = [];
  for (const target of [
    page.getByRole('button', { name: 'Menü öffnen' }),
    page.getByText('Hallo Mia'),
    // By its label: under a card that covers it, the row is left out for screen readers.
    page.getByText('Arbeit', { exact: true }),
  ]) {
    const box = await target.boundingBox();
    if (!box) throw new Error('not on the screen');
    ys.push(Math.round(box.y));
  }
  return ys;
}

async function worksheetJpeg(page: Page, path: string): Promise<void> {
  // A phone photo is big: 1600 × 2000 pixels (800 × 1000 at twice the density).
  const sheet = await page
    .context()
    .browser()!
    .newPage({
      viewport: { width: 800, height: 1000 },
      deviceScaleFactor: 2,
    });
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
  await expect(page.getByText(/Nachrichten aufs Handy: aus/)).toBeVisible();
  await shot(page, '03b-handover');
  await page.getByRole('button', { name: "Los geht's, Mia!" }).click();

  // ── Mia picks how Buddy sounds: a voice is already chosen, a tap plays and picks one ──
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  const picked = page.waitForResponse(
    (r) => r.url().endsWith('/buddy/settings') && r.request().method() === 'PATCH' && r.ok(),
  );
  await page.getByRole('radio', { name: 'Hell' }).click();
  await picked;
  // The walkthrough runs without Buddy's own voice: the phone reads the sample, and says so.
  await expect(page.getByText(/Gerade liest die Stimme deines Handys vor/)).toBeVisible();
  await shot(page, '03c-voice');
  await page.getByRole('button', { name: 'Weiter' }).click();

  // ── The three first-start cards, then the home ──
  await expect(page.getByText('Sag es Buddy einfach')).toBeVisible();
  await shot(page, '03d-onboarding');
  await page.getByRole('button', { name: 'Überspringen' }).click();

  // ── The student's first look: who Buddy is and how to start ──
  await expect(page.getByText('Hallo Mia')).toBeVisible();
  await expect(
    page.getByText('Ich helfe dir, dich auf Arbeiten und Tests vorzubereiten', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arbeit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Was möchtest du anhängen?' })).toBeVisible();
  await shot(page, '04-buddy-first-visit');
  // What the head and the bar take on the smallest phone: the rest is conversation (#64).
  await page.setViewportSize({ width: 360, height: 740 });
  const head = await partHeight(page, 'home-header', 'home');
  const bar = await partHeight(page, 'composer', 'home');
  console.log(`HOME 360x740: header ${head}pt, composer ${bar}pt`);
  // Measured 29.09.: 52 pt head, 68 pt bar — 16 % of a 740 pt phone. The bound is what
  // we keep, not what we hope for.
  expect(head + bar, `head ${head}pt + composer ${bar}pt`).toBeLessThanOrEqual(160);
  await page.setViewportSize({ width: 390, height: 844 });

  // ── Get to know: the test, and what Buddy needs for it ──
  await page
    .getByLabel('Schreib Buddy …')
    .fill('Ich schreibe am Freitag eine Mathearbeit über Brüche.');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(
    page.getByText('Super, dann bereiten wir uns bis Freitag zusammen vor.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/Eingetragen: Mathearbeit Brüche am/)).toBeVisible();
  // One card on top (the photo); the question about messages is asked in the conversation,
  // with what would be allowed — also for a minor (user feedback #4, #6).
  await expect(page.getByText('Schick mir ein Foto')).toBeVisible();
  await expect(page.getByText('Darf ich dir aufs Handy schreiben?')).toBeVisible();
  await expect(page.getByText(/Nie nach 20:00 Uhr\. Das erlauben deine Eltern/)).toBeVisible();
  // The conversation stands at its newest message, like any chat: Buddy's question at the end
  // is on screen, not below the fold (05-buddy-planned-360).
  await expect(page.getByText('Darf ich dir aufs Handy schreiben?')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Eltern fragen' })).toBeInViewport();
  // With the keyboard open (a small phone keeps ~420 pt of window) the newest message must
  // still be on screen — "wenn ich was schreibe, erkenne ich in der app gar nichts mehr"
  // (owner 28.09., issue #51).
  await page.setViewportSize({ width: 360, height: 420 });
  await expect(page.getByText('Darf ich dir aufs Handy schreiben?')).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  // The card lies over the greeting and the ways to start: they stand where they stand
  // without a card (owner: "Die Meldung sollte einfach über dem Menü liegen").
  const homeAt = await homePositions(page);
  // The layer on top keeps its hard size contract (issue #17): one slim bar,
  // ≤ ~64 pt collapsed, plus the layer's 8 pt of air above it.
  const captureBar = await partHeight(page, 'home-card', 'home-top');
  expect(captureBar, `top layer ${captureBar}pt`).toBeLessThanOrEqual(72);
  await shot(page, '05-buddy-planned');
  // The ask for the photo stands once, with its button (issue #94): while the bar on top
  // asks, no word-for-word "Ich warte auf dein Foto" receipt doubles it in the
  // conversation, and the way out — "Kein Foto nötig" — opens from the bar itself.
  await expect(page.getByText(/Ich warte auf dein Foto/)).toHaveCount(0);
  await page.getByRole('button', { name: /Arbeitsblatt Brüche\. Schick mir ein Foto/ }).click();
  await expect(page.getByRole('button', { name: 'Kein Foto nötig' })).toBeVisible();
  await page.getByRole('button', { name: /Arbeitsblatt Brüche\. Schick mir ein Foto/ }).click();
  await expect(page.getByRole('button', { name: 'Kein Foto nötig' })).toBeHidden();

  // ── Messages to the phone need a parent: the PIN, not the student — and the parent sees
  // what they allow, and that it was allowed ──
  await page.getByRole('button', { name: 'Eltern fragen' }).click();
  await expect(page.getByText('PIN der Eltern')).toBeVisible();
  await expect(
    page.getByText(/Ihr erlaubt, dass Buddy Mia aufs Handy schreibt\. .*Nie nach 20:00 Uhr/),
  ).toBeVisible();
  await shot(page, '06-parent-pin');
  for (const digit of pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await expect(page.getByText('Hallo Mia')).toBeVisible();
  // The web cannot set up this phone for notifications: no toast over the chat about it (live
  // finding 8) — settings says it calmly.
  await expect(page.getByText(/^Erlaubt[.:]/)).toHaveCount(0);
  await expect(page.getByText('Darf ich dir aufs Handy schreiben?')).toBeHidden();

  // ── The worksheet: photographed, sent, read in the background ──
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await expect(page.getByText('Fotografier dein Blatt')).toBeVisible();
  await shot(page, '07-capture-empty');
  const photo = join(SHOTS, '..', 'worksheet.jpg');
  await worksheetJpeg(page, photo);
  // A blurry photo first: the phone itself says so at once, and "Neu fotografieren" replaces it.
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Foto machen' }).click();
  await (
    await chooser
  ).setFiles(join(__dirname, '../../apps/mobile/lib/photo/__tests__/fixtures/blur.jpg'));
  await expect(page.getByText('Foto 1 ist unscharf.')).toBeVisible();
  await expect(page.getByText('Schwer lesbar')).toBeVisible();
  await shot(page, '08a-capture-blurry');
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Neu fotografieren' }).click();
  await (await chooser).setFiles(photo);
  await expect(page.getByRole('img', { name: 'Foto 1 von 1' })).toBeVisible();
  await expect(page.getByText('Foto 1 ist unscharf.')).toHaveCount(0);
  await expect(page.getByText('Schwer lesbar')).toHaveCount(0);
  await shot(page, '08-capture-photo');
  await page.getByRole('button', { name: 'Senden' }).click();

  // ── Buddy acts on it by itself: reads it, prepares practice, says so ──
  // Here in the app the card says it now, and Buddy's message about it is in the chat with it
  // (she is in the app, so it is shown here, not pushed).
  // One slim line (owner request): what, how long, "Jetzt üben"; details on a tap.
  await expect(
    page.getByRole('button', { name: /^Übung bereit: Mathearbeit Brüche\./ }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/^4 Aufgaben · ca\. 5 Min\.$/)).toBeVisible();
  expect(await homePositions(page)).toEqual(homeAt);
  // The ready bar honours the same size contract as every layer on top (issue #17),
  // and carries the close button (swiping the layer away is walked through in tour.spec.ts).
  const readyBar = await partHeight(page, 'home-card', 'home-top');
  expect(readyBar, `top layer ${readyBar}pt`).toBeLessThanOrEqual(72);
  await expect(page.getByRole('button', { name: 'Karte ausblenden' })).toBeVisible();
  // The chat still stands at its newest message under the card.
  await expect(page.getByText(/Vorbereitet: Mathearbeit Brüche/)).toBeInViewport();
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
    // Her right answer stands once — as her own bubble; no "Lösung" card repeats
    // the word she just wrote herself (issue #93).
    await expect(page.getByText('Lösung', { exact: true })).toHaveCount(0);
    if (n === 1 || current.choice) await shot(page, `10-practice-q${n}`);
    await page.getByRole('button', { name: 'Weiter' }).click();
  }
  // A true, kind sentence instead of a hit rate (user feedback #1).
  await expect(page.getByText('Alles saß gleich beim ersten Mal', { exact: false })).toBeVisible();
  await expect(page.getByText('Auf Anhieb richtig')).toHaveCount(0);
  await shot(page, '11-practice-summary');
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();

  // ── Feedback understood, behaviour adapted ──
  await expect(page.getByText('Hallo Mia')).toBeVisible();
  await page.getByLabel('Schreib Buddy …').fill('Mach die Übungen bitte kürzer.');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('Mach ich – ab jetzt kurze Runden.')).toBeVisible();
  await expect(page.getByText('Gemerkt: Möchte kurze Übungen')).toBeVisible();
  expect(await homePositions(page)).toEqual(homeAt);
  await expect(page.getByText('Gemerkt: Möchte kurze Übungen')).toBeInViewport();
  await shot(page, '12-buddy-feedback');

  // ── The finished practice stands in the conversation, not on top (issue #17): the same
  // kind words, the full view one tap away — and nothing lies over the ways to start ──
  const card = page.getByTestId('home-card');
  await expect(card).toHaveCount(0);
  await expect(page.getByText('Geschafft!')).toBeVisible();
  await page.getByRole('button', { name: 'Arbeit', exact: true }).click({ trial: true });
  await shot(page, '12b-buddy-result-in-thread');
  await page.getByRole('button', { name: 'Ansehen' }).click();
  // The full summary again (the thread behind keeps its short version of the same words).
  await expect(
    page.getByText('Alles saß gleich beim ersten Mal', { exact: false }).last(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Zurück zu Buddy' }).click();
  await expect(page.getByText('Hallo Mia')).toBeVisible();
  // What the app's own stopwatch measured on the way here (issue #66) — read before the
  // reload, which is what clears it (the spans live in memory, nothing is stored).
  await recordPerf(page, 'core-loop');
  await page.reload();
  await expect(page.getByText('Hallo Mia')).toBeVisible();
  await expect(page.getByText('Gemerkt: Möchte kurze Übungen')).toBeVisible();
  await expect(card).toHaveCount(0);

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

  await openMenu('Materialien');
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
  // Where the note about phone messages lives, calmly (instead of a toast on the home).
  await expect(page.getByText(/Alles kommt hier in der App\./)).toBeVisible();
  await shot(page, '15b-settings-contact', { opened: true });
  // Buddy's voice: closed with the one she picked in the setup; opened, the same picker.
  await expect(page.getByText('Hell', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Buddys Stimme' }).click();
  const repicked = page.waitForResponse(
    (r) => r.url().endsWith('/buddy/settings') && r.request().method() === 'PATCH' && r.ok(),
  );
  await page.getByRole('radio', { name: 'Klar' }).click();
  await repicked;
  await shot(page, '15c-settings-voice', { opened: true });
  await page.getByRole('button', { name: 'Buddys Stimme' }).click();
  await expect(page.getByText('Klar', { exact: true })).toBeVisible();

  // ── The look: every option previews in ITS OWN colours, and night stays readable ──
  // (issue #84: module-scope styles froze the start palette's ink, which was invisible on
  // the night background — the axe pass at every shot is what catches that class now.)
  await page.getByRole('button', { name: 'Aussehen' }).click();
  await expect(page.getByRole('radio', { name: 'Nacht' })).toBeVisible();
  await shot(page, '15f-settings-look', { opened: true });
  await page.getByRole('radio', { name: 'Nacht' }).click();
  await expect(page.getByRole('radio', { name: 'Nacht' })).toHaveAttribute('aria-checked', 'true');
  await shot(page, '15g-settings-night', { opened: true });
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('Hallo Mia')).toBeVisible();
  // The whole home in the night palette: fit and contrast, like every other stop.
  await shot(page, '15h-home-night');
  await openMenu('Einstellungen');
  await page.getByRole('button', { name: 'Aussehen' }).click();
  await page.getByRole('radio', { name: 'Pastell' }).click();
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.getByText('Hallo Mia')).toBeVisible();

  test.info().annotations.push({ type: 'email', description: email });
});
