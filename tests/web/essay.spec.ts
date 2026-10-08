// Browser walkthrough of a long text (issue #258), same dev stack as the other walkthroughs;
// scripted answers in apps/api/src/testing/scenarios/essay.ts. She asks Buddy to practise a
// discussion on a school phone ban, taps the offer, writes about 1700 words into the one input bar
// (tall), the draft survives a restart, and Buddy's feedback names each key point — her own words
// marked as hers — and three places to improve. Her text stays in the field: the next version
// starts from it, up to the third, which closes the task. No new screen: the offer card in the
// chat and the practice card she already knows. Screenshots go to test-results/web/shots.

import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { a11y, overflows, PHONES, setScheme, settle, shot, SHOTS } from './fit';

const TASK = 'Erörtere: Sollte es an Schulen ein Handyverbot geben?';

/** The words every offer card's button carries (components/learn/OfferCard.tsx). */
const START = "Los geht's";

function offerStart(page: Page, says: string) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: START }) })
    .filter({ hasText: says })
    .last()
    .getByRole('button', { name: START });
}

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`aufsatz-${Date.now()}@example.test`);
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
  await page.getByLabel('Jahr', { exact: true }).fill('2011');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('checkbox', { name: /sorgeberechtigt/ }).click();
  await page.getByLabel('PIN der Eltern').fill('4826');
  await page.getByLabel('PIN wiederholen').fill('4826');
  await page.getByRole('button', { name: "Los geht's" }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/**
 * One stop of the walk, in daylight and at night, at 390×844 and 360×740 (`shot`). Back in
 * daylight once the switch has landed (`setScheme`): she writes on right after it (#443).
 */
async function both(page: Page, name: string): Promise<void> {
  await shot(page, name);
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, `${name}-night`);
  await setScheme(page, 'light');
}

/**
 * `shot` for a state whose field holds her long text: the same fit, keyboard and accessibility
 * checks, except that the field itself scrolls — 1700 words in a field that shows ten lines of
 * them have to (`fit.ts` names only the conversation, a list and a reading text as scrolling, so
 * the one exception is made here, for this spec, and nowhere else). With the keyboard up on the
 * small phone the question and the field both stay in view.
 */
async function look(page: Page, name: string): Promise<void> {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const tag = scheme === 'dark' ? `${name}-night` : name;
    for (const phone of PHONES) {
      await page.setViewportSize(phone);
      await settle(page);
      const tooLong = (await overflows(page)).filter(
        (o) => !o.allowed && o.label !== 'answer-field',
      );
      expect(tooLong, `${tag} @${phone.width}: must fit without scrolling`).toEqual([]);
      // Buddy's newest feedback stands from its first line on — taller than the room, it was
      // hidden whole (`threadRoom` `reads`).
      if ((await page.getByTestId('essay-feedback').count()) > 0)
        await expect(
          page.getByText('Erörterung – so steht dein Text').last(),
          `${tag} @${phone.width}: the feedback`,
        ).toBeInViewport();
      await page.screenshot({
        path: join(SHOTS, phone.width === 390 ? `${tag}.png` : `${tag}-${phone.width}.png`),
      });
    }
    await page.setViewportSize({ width: 360, height: 440 });
    await page.getByLabel('Deine Antwort').focus();
    await settle(page);
    await page.screenshot({ path: join(SHOTS, `${tag}-kb.png`) });
    await expect(page.getByLabel('Deine Antwort'), `${tag} @kb: the field`).toBeInViewport();
    await expect(page.getByText(TASK), `${tag} @kb: the question`).toBeInViewport();
    await page.getByLabel('Deine Antwort').blur();
    expect(await a11y(page, tag), `${tag}: accessibility`).toEqual([]);
  }
  // She writes the next version right after this: the switch back lands first (#443).
  await setScheme(page, 'light');
  await page.setViewportSize({ width: 390, height: 844 });
}

const INTRO =
  'Viele Schulen überlegen, ob Handys im Unterricht verboten werden sollen. Ich bin der Meinung, dass ein Handyverbot an Schulen sinnvoll ist.';
const BODY = [
  'Ein wichtiges Argument ist die Konzentration im Unterricht. Wer sein Handy in der Tasche hat, denkt an neue Nachrichten und hört weniger zu. Zum Beispiel schauen in meiner Klasse viele heimlich unter dem Tisch auf den Bildschirm.',
  'Außerdem reden die Schüler in den Pausen wieder mehr miteinander. Ohne Handy spielt man Fußball oder unterhält sich, statt nebeneinander zu sitzen und zu tippen. Das stärkt die Klassengemeinschaft.',
  'Ein weiterer Grund ist der Schutz vor Mobbing. Fotos und Videos, die in der Schule heimlich gemacht werden, landen schnell in Gruppenchats. Ein Verbot macht das schwerer und schützt alle.',
];
const CONCLUSION = 'Insgesamt finde ich, dass ein Handyverbot den Schülern mehr nützt als schadet.';

/** Her essay: an introduction, the body paragraphs again and again, a conclusion — ~1700 words. */
function essay(): string {
  const paragraphs = [INTRO];
  const length = (more: string) => [...paragraphs, more, CONCLUSION].join('\n').length;
  for (let i = 0; length(BODY[i % 3]!) <= 11_850; i++) paragraphs.push(BODY[i % 3]!);
  // Close to the end of the field, where the count shows (`InputBar`, the last 200 characters).
  while (length(PAD) <= 11_850) paragraphs.push(PAD);
  return [...paragraphs, CONCLUSION].join('\n');
}

const PAD = 'Das merke ich jeden Tag.';

const COUNTER =
  'Andererseits kann ein Handy im Unterricht auch helfen, etwa beim Nachschlagen von Wörtern. Dieses Argument wiegt aber weniger schwer als die Ablenkung.';

test('Lange Texte: she writes an essay, the draft survives, Buddy answers per key point (issue #258)', async ({
  page,
}) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Ich will eine Erörterung zum Handyverbot üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText('schreib deine Erörterung', { exact: false })).toBeVisible();
  await expect(offerStart(page, 'Aufsatz schreiben')).toBeVisible();
  await both(page, '80-essay-offer');

  await offerStart(page, 'Aufsatz schreiben').click();
  await expect(page.getByText(TASK)).toBeVisible();
  const field = page.getByLabel('Deine Antwort');
  // The key points are nowhere on the screen while she writes.
  await expect(page.getByText('Gegenargument', { exact: false })).toHaveCount(0);
  await both(page, '81-essay-question');

  // About 1700 words: more than any other answer may be, less than the 12 000 an essay takes.
  const text = essay();
  expect(text.length).toBeGreaterThan(11_000);
  expect(text.length).toBeLessThan(12_000);
  await field.fill(text);
  await expect(field).toHaveValue(text);
  // Near the end of the field, and only there, the count shows.
  await expect(page.getByText(/^Noch \d+ Zeichen$/)).toBeVisible();
  await look(page, '82-essay-writing');

  // An app restart: the draft is still there (lib/drafts.ts).
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByLabel('Deine Antwort')).toHaveValue(text);

  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByTestId('essay-feedback')).toBeVisible();
  await expect(page.getByText('Erörterung – so steht dein Text')).toBeVisible();
  await expect(page.getByText('Fassung 1 ·', { exact: false })).toBeVisible();
  await expect(page.getByText('noch offen')).toBeVisible();
  await expect(page.getByText(`„${INTRO.split('. ')[0]}.“`).first()).toBeVisible();
  // No grade anywhere, and her text stays in the field for the next version.
  await expect(page.getByText(/Note|Punkte|falsch/)).toHaveCount(0);
  await expect(field).toHaveValue(text);
  await look(page, '83-essay-feedback');

  // Version 2 starts from her text: one paragraph becomes a counter-argument.
  const second = text.replace(BODY[1]!, COUNTER);
  expect(second.length).toBeLessThan(12_000 - 30);
  await field.fill(second);
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Fassung 2 ·', { exact: false })).toBeVisible();
  await expect(page.getByText(`„${COUNTER.split('. ')[0]}.“`).first()).toBeVisible();
  await look(page, '84-essay-version2');

  // The third version is the last: the task closes, "Weiter" leads on.
  await expect(field).toHaveValue(second);
  await field.fill(second.replace(CONCLUSION, `${CONCLUSION} Darum bin ich dafür.`));
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText(/letzte Fassung/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weiter' })).toBeVisible();
  await shot(page, '85-essay-last');
});
