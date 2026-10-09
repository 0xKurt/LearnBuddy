// Browser walkthrough of the charts (issues #245, #246; scripted answers in
// apps/api/src/testing/scenarios/learning-modes.ts, `CHART_ITEMS`): every chart type next to its
// question, at both phone sizes, light and dark, answered and judged without a model.
// Screenshots go to test-results/web/shots.

import { expect, test, type Page } from '@playwright/test';

import { CHART_WIDTH } from '../../packages/shared-math/src/charts';
import { PHONES, setScheme, settle, shot } from './fit';

/** The words every offer card's button carries (components/learn/OfferCard.tsx). */
const START = "Los geht's";

async function onboardChild(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('E-Mail').fill(`charts-${Date.now()}@example.test`);
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
  await page.getByRole('button', { name: START }).click();
  await expect(page.getByText('Fertig! Das ist eingestellt:')).toBeVisible();
  await page.getByRole('button', { name: "Los geht's, Lena!" }).click();
  await expect(page.getByText('Wie soll Buddy klingen?')).toBeVisible();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('button', { name: 'Überspringen' }).click();
  await expect(page.getByText('LearnBuddy')).toBeVisible();
}

/**
 * Each question by its prompt: the shot's name, what the screen reader hears from the chart
 * (a word of it), and how she answers. A reading within the drawing's tolerance is right — the
 * sum is answered with 565 rather than the exact 571 on purpose.
 */
const QUESTIONS: Array<{
  prompt: string;
  name: string;
  hears: RegExp;
  answer: { type: string } | { tap: string };
  /** A circle, not drawn across the whole width (`PieChartView`): its width is not measured. */
  round?: true;
}> = [
  {
    prompt: 'Wie hoch ist der Jahresniederschlag in Berlin?',
    name: '60-chart-climate',
    hears: /Klimadiagramm Berlin, 34 m über dem Meer/,
    answer: { type: '565' },
  },
  {
    prompt: 'Welchen Weg hat der Wagen nach 3 s zurückgelegt?',
    name: '61-chart-line',
    hears: /Diagramm, x-Achse/,
    answer: { type: '18' },
  },
  {
    prompt: 'Wie groß ist der Mittelpunktswinkel für „Bus“?',
    name: '62-chart-pie',
    hears: /Kreisdiagramm: Bus 40 %/,
    answer: { type: '144' },
    round: true,
  },
  {
    prompt: 'Wie groß ist der Median der Klasse 7a?',
    name: '63-chart-box',
    hears: /Boxplot Klasse 7a: Minimum 138 cm/,
    answer: { type: '152' },
  },
  {
    prompt: 'Wie groß ist',
    name: '64-chart-histogram',
    hears: /Histogramm/,
    answer: { type: '0,375' },
  },
  {
    prompt: 'Wie groß ist die Steigung der Ausgleichsgeraden?',
    name: '65-chart-scatter',
    hears: /Streudiagramm mit 5 Punkten/,
    answer: { type: '2' },
  },
  {
    prompt: 'Welchen Typ hat diese Bevölkerungspyramide?',
    name: '66-chart-pyramid',
    hears: /Bevölkerungspyramide: 0–9 Jahre: Männer 9,5 %/,
    answer: { tap: 'Pyramide' },
  },
];

test('charts: every chart type drawn, read and judged by code', async ({ page }) => {
  await onboardChild(page);
  await page.getByLabel('Schreib Buddy …').fill('Ich will Diagramme üben');
  await page.getByRole('button', { name: 'Senden' }).click();
  const offer = 'Diagramme zum Ablesen vorbereitet';
  await expect(page.getByText(offer, { exact: false })).toBeVisible();
  await page
    .locator('div')
    .filter({ has: page.getByRole('button', { name: START }) })
    .filter({ hasText: offer })
    .last()
    .getByRole('button', { name: START })
    .click();
  await expect(page.getByText('Frage von Buddy')).toBeVisible();

  const seen = new Set<string>();
  for (let n = 0; n < QUESTIONS.length; n++) {
    const figure = page.getByTestId('question-figure');
    await expect(figure).toBeVisible();
    const label = (await figure.locator('[aria-label]').first().getAttribute('aria-label')) ?? '';
    const q = QUESTIONS.find((x) => !seen.has(x.name) && x.hears.test(label));
    expect(q, `a chart this walkthrough knows: ${label.slice(0, 80)}`).toBeDefined();
    if (!q) return;
    seen.add(q.name);
    await expect(page.getByText(q.prompt, { exact: false }).first()).toBeVisible();

    // Light and dark at both phone sizes; nothing may need scrolling.
    await page.emulateMedia({ colorScheme: 'light' });
    await shot(page, q.name);
    await page.emulateMedia({ colorScheme: 'dark' });
    await shot(page, `${q.name}-dark`);
    // Measured and answered right after the switch back: it lands first (`setScheme`, #443).
    await setScheme(page, 'light');

    // The drawing fits the narrow phone: no part of it reaches past the card.
    await page.setViewportSize({ width: 360, height: 740 });
    const box = await figure.boundingBox();
    expect(box?.width ?? 0, `${q.name}: figure width at 360`).toBeLessThanOrEqual(360 - 2 * 16);
    await page.setViewportSize({ width: 390, height: 844 });

    if ('type' in q.answer) {
      await page.getByLabel('Deine Antwort').fill(q.answer.type);
      await page.getByRole('button', { name: 'Prüfen' }).click();
    } else {
      await page.getByRole('button', { name: q.answer.tap, exact: true }).click();
    }
    await expect(page.getByText('Richtig', { exact: true })).toBeVisible();
    // Answered, the card gives room back to the conversation; the chart still keeps the width its
    // labels are checked at (`CHART_WIDTH`, issue #501) — scaled below it, the climate chart stood
    // squashed, its twelve month initials on top of each other.
    for (const phone of q.round ? [] : PHONES) {
      await page.setViewportSize(phone);
      await settle(page);
      const drawn = await figure.evaluate((el) =>
        Math.max(
          0,
          ...Array.from(el.querySelectorAll('svg'), (s) => s.getBoundingClientRect().width),
        ),
      );
      expect(drawn, `${q.name} answered @${phone.width}: the chart's width`).toBeGreaterThanOrEqual(
        CHART_WIDTH,
      );
    }
    await page.setViewportSize(PHONES[0]);
    if (n === 0) await shot(page, '67-chart-answered');
    if (n < QUESTIONS.length - 1) await page.getByRole('button', { name: 'Weiter' }).click();
  }
  expect([...seen].sort()).toEqual(QUESTIONS.map((q) => q.name).sort());
});
