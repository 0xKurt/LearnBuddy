// The promo recording (branch claude/promo-video, .github/workflows/promo.yml, promo/storyboard.md):
// the real app used live at reading pace in ONE session with Playwright's video on — setup with
// the parents' PIN, the test in one sentence, the worksheet photo, the practice Buddy prepares,
// a hint, the result and the agreed reminder. LB_PROMO_LANG picks the language (de | en); the run
// brings its own learner (Engineering-Regel 7). The scripted model answers exactly the sentences
// typed here: German in apps/api/src/testing/scenarios/core-loop.ts, English in promo-en.ts.
//
// Written to test-results/web/promo/: marks-<lang>.json (scene starts and the parts the edit
// removes, in ms since the test began) and app-<lang>.webm. Nothing here resizes the window or
// takes screenshots (shot, bothSchemes, settle …): both would show in the video.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { PIN, freshEmail, worksheetJpeg } from './coreLoop';
import { expectSeen } from './seen';

type Lang = 'de' | 'en';
const LANG: Lang = process.env.LB_PROMO_LANG === 'en' ? 'en' : 'de';
const OUT = join(__dirname, '../../test-results/web/promo');

test.use({
  locale: LANG === 'en' ? 'en-GB' : 'de-DE',
  viewport: { width: 390, height: 844 },
  // At the page's own size: Playwright paints a 2× page into a bigger frame without scaling it.
  video: { mode: 'on', size: { width: 390, height: 844 } },
  colorScheme: 'light',
  // The motion stays on (Buddy's orb, entrances): it is part of what the video shows.
  reducedMotion: 'no-preference',
});

type Question = {
  /** The task as she sees it (a RegExp where its fractions are set). */
  prompt: string | RegExp;
  /** What she types, or the name of the choice she taps. */
  answer: string;
  choice?: true;
};

/** Every word the recording types, taps or waits for, from apps/mobile/locales/<lang>. */
type Copy = {
  welcome: string;
  email: string;
  password: string;
  repeat: string;
  create: string;
  consentTitle: string;
  consentNext: string;
  profileTitle: string;
  child: string;
  childName: string;
  chooseState: string;
  state: string;
  day: string;
  month: string;
  year: string;
  next: string;
  parentTitle: string;
  guardian: RegExp;
  pin: string;
  pinRepeat: string;
  contactTitle: string;
  contactBody: string;
  allow: string;
  handoverTitle: string;
  handoverPin: RegExp;
  handoverPush: RegExp;
  handoverBody: string;
  go: string;
  voice: string;
  voiceNext: string;
  skip: string;
  greeting: RegExp;
  introBody: string;
  composer: string;
  send: string;
  planSentence: string;
  planReply: string;
  planReceipt: RegExp;
  captureBody: string;
  waitingForPhoto: RegExp;
  takeBack: string;
  addPhoto: string;
  attachTitle: string;
  takePhoto: string;
  photoTile: string;
  blurry: string;
  ready: RegExp;
  readyBody: RegExp;
  prepared: string;
  practise: string;
  progress: (n: number) => string;
  answer: string;
  check: string;
  right: string;
  notQuite: string;
  questions: Question[];
  why: { prompt: string; wrong: string; hint: string; right: string; praise: string };
  done: string;
  finished: string;
  answered: string;
  allFirst: string;
  shaky: RegExp;
  back: string;
  view: RegExp;
  remindSentence: string;
  remindReply: string;
  remindReceipt: RegExp;
  inAppOnly: string;
  /** The scene headlines (promo/scenes.json), as the marks' labels. */
  scenes: [string, string, string, string, string, string, string];
};

const COPY: Record<Lang, Copy> = {
  de: {
    welcome: 'Dein Lernbuddy für Arbeiten und Tests.',
    email: 'E-Mail',
    password: 'Passwort',
    repeat: 'Passwort wiederholen',
    create: 'Konto erstellen',
    consentTitle: 'Kurz zum Datenschutz',
    consentNext: 'Weiter',
    profileTitle: 'Wer lernt mit LearnBuddy?',
    child: 'Mein Kind',
    childName: 'Wie heißt dein Kind? (Spitzname genügt)',
    chooseState: 'Bundesland wählen',
    state: 'Niedersachsen',
    day: 'Tag',
    month: 'Monat',
    year: 'Jahr',
    next: 'Weiter',
    parentTitle: 'Noch kurz für die Eltern',
    guardian: /sorgeberechtigt/,
    pin: 'PIN der Eltern',
    pinRepeat: 'PIN wiederholen',
    contactTitle: 'Darf Buddy Mia Benachrichtigungen schicken?',
    contactBody: 'Zum Beispiel eine Erinnerung vor einer Arbeit.',
    allow: 'Ja, erlauben',
    handoverTitle: 'Fertig! Das ist eingestellt:',
    handoverPin: /PIN der Eltern: gesetzt – nur ihr kennt sie/,
    handoverPush: /Push-Benachrichtigungen: erlaubt/,
    handoverBody: 'Gib Mia jetzt das Handy.',
    go: "Los geht's, Mia!",
    voice: 'Buddys Stimme',
    voiceNext: 'Weiter',
    skip: 'Überspringen',
    greeting: /^Hallo Mia\.\s*Was steht an\?/,
    introBody: 'Erzähl mir von deiner nächsten Arbeit oder zeig mir ein Arbeitsblatt.',
    composer: 'Schreib Buddy …',
    send: 'Senden',
    planSentence: 'Ich schreibe am Freitag eine Mathearbeit über Brüche.',
    planReply:
      'Super, dann bereiten wir uns bis Freitag zusammen vor. Hast du ein Arbeitsblatt dazu? Ein Foto reicht.',
    planReceipt: /Eingetragen: Mathearbeit Brüche am /,
    captureBody: 'Schick mir ein Foto',
    waitingForPhoto: /Ich warte auf dein Foto/,
    takeBack: 'Zurücknehmen',
    addPhoto: 'Foto hinzufügen',
    attachTitle: 'Was möchtest du anhängen?',
    takePhoto: 'Foto aufnehmen',
    photoTile: 'Foto 1 von 1',
    blurry: 'Foto 1 ist unscharf.',
    ready: /^Übung bereit: Mathearbeit Brüche\./,
    readyBody: /^4 Aufgaben · ca\. 5 Min\.$/,
    prepared: 'Aus deinem Arbeitsblatt habe ich eine kurze Übung gemacht.',
    practise: 'Jetzt üben',
    progress: (n) => `Aufgabe ${n} von 4`,
    answer: 'Deine Antwort',
    check: 'Prüfen',
    right: 'Richtig',
    notQuite: 'Noch nicht ganz',
    questions: [
      { prompt: 'Kürze 6/8 und gib das Ergebnis als Dezimalzahl an.', answer: '0,75' },
      { prompt: /^Welcher Bruch ist größer:/, answer: '2 Drittel', choice: true },
      { prompt: 'Wie heißt die Zahl unter dem Bruchstrich?', answer: 'Nenner' },
    ],
    why: {
      prompt: 'Warum multipliziert man beim Erweitern Zähler und Nenner mit derselben Zahl?',
      // Neither "wert" nor "gleich": the scripted tutor tells the two answers apart by them.
      wrong: 'Damit der Bruch größer wird.',
      hint: 'Fast. Denk daran, was mit dem Wert des Bruchs passiert.',
      right: 'Damit der Wert gleich bleibt.',
      praise: 'Genau – der Wert bleibt gleich, nur die Darstellung ändert sich.',
    },
    done: 'Geschafft!',
    finished: 'Fertig',
    answered: 'Du hast 4 Aufgaben beantwortet.',
    allFirst: 'Alles saß gleich beim ersten Mal.',
    shaky: /Schauen wir nochmal an/,
    back: 'Zurück zu Buddy',
    view: /^Ansehen/,
    remindSentence: 'Erinnere mich morgen um 16 Uhr an Brüche.',
    remindReply: 'Alles klar, ich erinnere dich morgen um 16 Uhr an Brüche.',
    remindReceipt: /Verabredet: Brüche üben morgen, 16:00/,
    inAppOnly: 'Verabredetes erscheint hier in der App – Benachrichtigungen sind aus.',
    scenes: [
      'Mit Eltern-PIN',
      'Eine Arbeit steht an',
      'Foto vom Arbeitsblatt',
      'Übung ist bereit',
      'Ein Tipp hilft weiter',
      'Geschafft!',
      'Bis morgen, 16 Uhr',
    ],
  },
  en: {
    welcome: 'Your study buddy for tests and exams.',
    email: 'E-mail',
    password: 'Password',
    repeat: 'Repeat password',
    create: 'Create account',
    consentTitle: 'A quick word on privacy',
    consentNext: 'Continue',
    profileTitle: 'Who is learning with LearnBuddy?',
    child: 'My child',
    childName: "What's your child's name? (A nickname is fine)",
    chooseState: 'Choose your federal state',
    state: 'Lower Saxony (Niedersachsen)',
    day: 'Day',
    month: 'Month',
    year: 'Year',
    next: 'Next',
    parentTitle: 'One more thing for the parents',
    guardian: /parental responsibility/,
    pin: "Parents' PIN",
    pinRepeat: 'Repeat PIN',
    contactTitle: 'May Buddy send Mia notifications?',
    contactBody: 'For example a reminder before a test.',
    allow: 'Yes, allow',
    handoverTitle: 'Done! This is set up:',
    handoverPin: /Parents' PIN: set – only you know it/,
    handoverPush: /Push notifications: allowed/,
    handoverBody: 'Now hand the phone to Mia.',
    go: "Let's go, Mia!",
    voice: "Buddy's voice",
    voiceNext: 'Continue',
    skip: 'Skip',
    greeting: /^Hello Mia\.\s*What's coming up\?/,
    introBody: 'Tell me about your next test or show me a worksheet.',
    composer: 'Write to Buddy …',
    send: 'Send',
    planSentence: 'I have a maths test on Friday about fractions.',
    planReply:
      "Great, let's get ready for Friday together. Do you have a worksheet for it? A photo is enough.",
    planReceipt: /Added: Fractions test on /,
    captureBody: 'Send me a photo',
    waitingForPhoto: /Waiting for your photo/,
    takeBack: 'Take back',
    addPhoto: 'Add photo',
    attachTitle: 'What do you want to attach?',
    takePhoto: 'Take photo',
    photoTile: 'Photo 1 of 1',
    blurry: 'Photo 1 is blurry.',
    ready: /^Practice ready: Fractions test\./,
    readyBody: /^4 tasks · about 5 min$/,
    prepared: 'I made a short practice from your worksheet.',
    practise: 'Practise',
    progress: (n) => `Task ${n} of 4`,
    answer: 'Your answer',
    check: 'Check',
    right: 'Right',
    notQuite: 'Not quite yet',
    questions: [
      { prompt: 'Simplify 6/8 and give the result as a decimal.', answer: '0.75' },
      { prompt: /^Which fraction is larger:/, answer: '2 thirds', choice: true },
      { prompt: 'What is the number below the fraction bar called?', answer: 'denominator' },
    ],
    why: {
      prompt: 'Why do you multiply the numerator and the denominator by the same number?',
      // Neither "value" nor "same": the scripted tutor tells the two answers apart by them.
      wrong: 'So the fraction gets bigger.',
      hint: 'Almost. Think about what happens to the value of the fraction.',
      right: 'So the value stays the same.',
      praise: 'Exactly – the value stays the same, only the way it looks changes.',
    },
    done: 'Done!',
    finished: 'Finished',
    answered: 'You answered 4 tasks.',
    allFirst: 'All of it right the first time.',
    shaky: /Worth another look/,
    back: 'Back to Buddy',
    view: /^View/,
    remindSentence: 'Remind me about fractions tomorrow at 4 pm.',
    remindReply: "Okay, I'll remind you about fractions tomorrow at 4 pm.",
    remindReceipt: /Agreed: Practise fractions tomorrow, 16:00/,
    inAppOnly: 'What you agreed shows up here in the app – notifications are off.',
    scenes: [
      "Parents' PIN",
      'Test coming up',
      'Photo of a worksheet',
      'Practice is ready',
      'A hint helps',
      'Done!',
      'Tomorrow at 4 pm',
    ],
  },
};

/** The English sheet (storyboard §6.2): 820 wide, so the app sends it at 1312 × 1600. */
const WORKSHEET_EN = `<body style="font-family: Georgia, serif; padding: 48px; background: #fffef8">
  <h1>Fractions – Worksheet</h1>
  <ol style="font-size: 26px; line-height: 2">
    <li>Simplify 6/8.</li>
    <li>Which fraction is larger: 2/3 or 3/5?</li>
    <li>What is the number below the fraction bar called?</li>
    <li>Why does the value stay the same when you make an equivalent fraction?</li>
  </ol>
</body>`;

/** The English worksheet "photographed" like worksheetJpeg(), at 820 × 1000 on a 2× screen. */
async function worksheetJpegEn(page: Page): Promise<string> {
  const browser = page.context().browser();
  if (!browser) throw new Error('no browser to draw the worksheet in');
  const path = join(OUT, 'worksheet-en.jpg');
  const sheet = await browser.newPage({
    viewport: { width: 820, height: 1000 },
    deviceScaleFactor: 2,
  });
  await sheet.setContent(WORKSHEET_EN);
  await sheet.screenshot({ path, type: 'jpeg', quality: 80 });
  await sheet.close();
  return path;
}

/** The video shows no pointer: every tap leaves a soft violet dot that fades (storyboard §4). */
function showTaps(): void {
  window.addEventListener(
    'pointerdown',
    (e) => {
      const dot = document.createElement('div');
      dot.style.cssText = [
        'position:fixed',
        `left:${e.clientX - 22}px`,
        `top:${e.clientY - 22}px`,
        'width:44px',
        'height:44px',
        'border-radius:22px',
        'background:rgba(124,92,255,.28)',
        'pointer-events:none',
        'z-index:2147483647',
      ].join(';');
      document.body.appendChild(dot);
      dot.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(1.4)' },
        ],
        { duration: 450, easing: 'ease-out' },
      ).onfinish = () => dot.remove();
    },
    true,
  );
}

type Check = () => Promise<void>;

/** Also on screen (checked while the frame is held; a miss fails the run at its end). */
const sees =
  (target: Locator): Check =>
  async () => {
    await expect.soft(target.first(), `on screen: ${target}`).toBeVisible({ timeout: 2_000 });
  };

/** Not on screen. */
const lacks =
  (target: Locator): Check =>
  async () => {
    await expect.soft(target, `not on screen: ${target}`).toHaveCount(0, { timeout: 2_000 });
  };

/**
 * Waits until `target` is there and seen (not only laid out, #738), then holds the frame for
 * `ms` in all — the reading time. The checks run inside that time, so a right screen keeps its
 * pace.
 */
async function show(target: Locator, ms: number, ...checks: Check[]): Promise<void> {
  await expect(target).toBeVisible();
  const from = Date.now();
  await expectSeen(target);
  for (const check of checks) await check();
  const rest = ms - (Date.now() - from);
  if (rest > 0) await target.page().waitForTimeout(rest);
}

/** Typed key by key, as she would; the field must then hold exactly the scripted text. */
async function type(target: Locator, text: string, delay: number, ms: number): Promise<void> {
  await target.click();
  await target.fill('');
  await target.pressSequentially(text, { delay });
  // A controlled field that dropped a key would send a sentence nobody scripted.
  if ((await target.inputValue()) !== text) await target.fill(text);
  await expect(target).toHaveValue(text);
  if (ms > 0) await target.page().waitForTimeout(ms);
}

/** The question on screen among those still open (the server picks the order). */
async function nextQuestion<Q extends { prompt: string | RegExp }>(
  page: Page,
  open: Q[],
  n: number,
): Promise<Q> {
  const until = Date.now() + 20_000;
  for (;;) {
    for (const q of open)
      if (await page.getByText(q.prompt, { exact: true }).first().isVisible()) return q;
    if (Date.now() > until) throw new Error(`no known question on screen (task ${n})`);
    await page.waitForTimeout(100);
  }
}

type Mark = { n: number | 'end'; atMs: number; label: string };
type Cut = { fromMs: number; toMs: number; label: string };

test(`promo recording (${LANG})`, async ({ page }) => {
  const t0 = Date.now();
  test.setTimeout(600_000);
  const T = COPY[LANG];
  const marks: Mark[] = [];
  const cuts: Cut[] = [];
  const openCuts: { atMs: number; label: string }[] = [];
  const since = () => Date.now() - t0;
  /** A scene starts here; a part the edit removes ends here. */
  const mark = (n: Mark['n'], label: string) => {
    const atMs = since();
    for (const c of openCuts.splice(0))
      cuts.push({ fromMs: c.atMs, toMs: atMs, label: c.label });
    marks.push({ n, atMs, label });
  };
  /** From here to the next mark the edit removes the recording. */
  const cut = (label: string) => openCuts.push({ atMs: since(), label });
  const email = freshEmail(`promo-${LANG}`);

  try {
    await page.addInitScript(showTaps);
    mkdirSync(OUT, { recursive: true });
    const photo = LANG === 'en' ? await worksheetJpegEn(page) : await worksheetJpeg(page);

    // ── Intro background and setup (removed in the edit, but for the welcome screen) ──
    await page.goto('/');
    const welcome = page.getByText(T.welcome);
    if (LANG === 'en') {
      // The app follows the browser's language (lib/i18n); the welcome pill is the way back.
      await expect(welcome.or(page.getByText(COPY.de.welcome))).toBeVisible();
      if (!(await welcome.isVisible())) {
        await page.getByRole('button', { name: /Deutsch/ }).click();
        await page.getByRole('radio', { name: 'English', exact: true }).click();
      }
    }
    await expect(welcome).toBeVisible();
    mark(0, 'Intro');
    await show(welcome, 2500);
    cut('sign-up');
    await page.getByLabel(T.email, { exact: true }).fill(email);
    await page.getByLabel(T.password, { exact: true }).fill('geheim-1234');
    await page.getByLabel(T.repeat, { exact: true }).fill('geheim-1234');
    await page.getByRole('button', { name: T.create }).click();
    await expect(page.getByText(T.consentTitle)).toBeVisible();
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: T.consentNext }).click();
    await expect(page.getByText(T.profileTitle)).toBeVisible();
    await page.getByRole('radio', { name: T.child }).click();
    await page.getByLabel(T.childName).fill('Mia');
    await page.getByRole('button', { name: T.chooseState }).click();
    await page.getByRole('radio', { name: T.state }).click();
    await page.getByLabel(T.day, { exact: true }).fill('14');
    await page.getByLabel(T.month, { exact: true }).fill('03');
    await page.getByLabel(T.year, { exact: true }).fill('2013');
    await page.getByRole('button', { name: T.next }).click();

    // ── 1 · The parents set their PIN and allow notifications ──
    mark(1, T.scenes[0]);
    await show(page.getByText(T.parentTitle), 1000);
    await page.getByRole('checkbox', { name: T.guardian }).click();
    await page.waitForTimeout(400);
    await type(page.getByLabel(T.pin), PIN, 180, 200);
    await type(page.getByLabel(T.pinRepeat), PIN, 180, 500);
    await page.getByRole('button', { name: T.next }).click();
    await show(page.getByText(T.contactTitle), 2800, sees(page.getByText(T.contactBody)));
    await page.getByRole('button', { name: T.allow, exact: true }).click();
    await show(
      page.getByText(T.handoverTitle),
      2500,
      sees(page.getByText(T.handoverPin)),
      sees(page.getByText(T.handoverPush)),
      sees(page.getByText(T.handoverBody)),
    );
    cut('handover and first start');
    await page.getByRole('button', { name: T.go }).click();
    // Buddy's own voices (LB_DEV_SPEECH=fake) add the voice step, taken as offered (signUpMia).
    const voice = page.getByRole('radiogroup', { name: T.voice, exact: true });
    const skip = page.getByRole('button', { name: T.skip });
    await expect(voice.or(skip)).toBeVisible();
    if (await voice.isVisible())
      await page.getByRole('button', { name: T.voiceNext, exact: true }).click();
    await skip.click();
    await expect(page.getByText('LearnBuddy')).toBeVisible();

    // ── 2 · One sentence: the test is entered, Buddy asks for the sheet ──
    mark(2, T.scenes[1]);
    await show(
      page.getByRole('heading', { name: T.greeting }),
      1500,
      sees(page.getByText(T.introBody)),
    );
    const composer = page.getByLabel(T.composer);
    await type(composer, T.planSentence, 35, 400);
    await page.getByRole('button', { name: T.send, exact: true }).click();
    await show(page.getByText(T.planReply), 0);
    await show(
      page.getByText(T.planReceipt),
      3000,
      sees(page.getByText(T.captureBody)),
      sees(page.getByRole('button', { name: T.takeBack, exact: true })),
      lacks(page.getByText(T.waitingForPhoto)),
    );

    // ── 3 · The worksheet, photographed in the chat ──
    mark(3, T.scenes[2]);
    await page.getByRole('button', { name: T.addPhoto }).click();
    const takePhoto = page.getByRole('button', { name: T.takePhoto, exact: true });
    await show(takePhoto, 700, sees(page.getByText(T.attachTitle)));
    const chooser = page.waitForEvent('filechooser');
    await takePhoto.click();
    await (await chooser).setFiles(photo);
    await show(
      page.getByRole('img', { name: T.photoTile }),
      1200,
      lacks(page.getByText(T.blurry)),
    );
    await page.getByRole('button', { name: T.send, exact: true }).click();
    // The reading card's words change quickly: held without waiting for one of them.
    await page.waitForTimeout(2000);
    cut('reading the sheet');
    await expect(page.getByRole('button', { name: T.ready })).toBeVisible({ timeout: 30_000 });

    // ── 4 · Practice from her own sheet is ready ──
    mark(4, T.scenes[3]);
    await show(page.getByText(T.prepared), 3000, sees(page.getByText(T.readyBody)));
    await page.getByRole('button', { name: T.practise, exact: true }).click();
    await show(page.getByText(T.progress(1)), 2000);

    // The questions come in the server's order; the "why" one is scene 5, the others are quick.
    const pending: Array<Question & { why?: true }> = [
      ...T.questions,
      { prompt: T.why.prompt, answer: T.why.right, why: true },
    ];
    const total = pending.length;
    for (let n = 1; n <= total; n++) {
      if (n > 1) await expect(page.getByText(T.progress(n))).toBeVisible();
      const q = await nextQuestion(page, pending, n);
      pending.splice(pending.indexOf(q), 1);
      const prompt = page.getByText(q.prompt, { exact: true }).first();
      if (q.why) {
        // ── 5 · A wrong answer gets a hint; "Right" only once it is right ──
        mark(5, T.scenes[4]);
        await show(prompt, 1500);
        const answer = page.getByLabel(T.answer, { exact: true });
        await type(answer, T.why.wrong, 45, 400);
        await page.getByRole('button', { name: T.check, exact: true }).click();
        await show(
          page.getByText(T.why.hint),
          2800,
          sees(page.getByText(T.notQuite, { exact: true })),
        );
        await type(answer, T.why.right, 45, 400);
        await page.getByRole('button', { name: T.check, exact: true }).click();
        await show(
          page.getByText(T.why.praise),
          2200,
          sees(page.getByText(T.right, { exact: true })),
        );
        cut('rest of the practice');
        await page.getByRole('button', { name: T.next, exact: true }).click();
        continue;
      }
      // One cut over the quick questions: before the hint, or the rest after it.
      if (openCuts.length === 0) cut('practice before the hint');
      await expectSeen(prompt);
      if (q.choice) {
        await page.getByRole('radio', { name: q.answer, exact: true }).click();
        await page.waitForTimeout(400);
      } else {
        await type(page.getByLabel(T.answer, { exact: true }), q.answer, 60, 300);
      }
      await page.getByRole('button', { name: T.check, exact: true }).click();
      await show(page.getByText(T.right, { exact: true }), 900);
      await page.getByRole('button', { name: T.next, exact: true }).click();
    }

    // ── 6 · Done: what went well, calmly; the result stays in the chat ──
    mark(6, T.scenes[5]);
    await show(
      page.getByRole('heading', { name: T.done, exact: true }),
      3000,
      sees(page.getByText(T.finished, { exact: true })),
      sees(page.getByText(T.answered)),
      lacks(page.getByText(T.allFirst)),
      lacks(page.getByText(T.shaky)),
    );
    await page
      .getByTestId('bottom-bar')
      .getByRole('button', { name: T.back, exact: true })
      .click();
    await show(page.getByRole('button', { name: T.view }), 2000);

    // ── 7 · A reminder for tomorrow at four, the way the parents allowed ──
    mark(7, T.scenes[6]);
    await type(composer, T.remindSentence, 35, 400);
    await page.getByRole('button', { name: T.send, exact: true }).click();
    await show(page.getByText(T.remindReply), 0);
    // Notifications are allowed (scene 1): the receipt stands without the in-app note.
    await show(
      page.getByText(T.remindReceipt),
      3500,
      sees(page.getByRole('button', { name: T.takeBack, exact: true })),
      lacks(page.getByText(T.inAppOnly)),
    );
    mark('end', 'end');
  } finally {
    // The marks and the video are kept for a failed run too: it shows how far it came.
    const video = page.video();
    const recorded = video ? await video.path() : null;
    await page.close();
    const closedAtMs = since();
    mkdirSync(OUT, { recursive: true });
    writeFileSync(
      join(OUT, `marks-${LANG}.json`),
      `${JSON.stringify(
        {
          lang: LANG,
          t0Iso: new Date(t0).toISOString(),
          marks,
          cuts,
          // The video runs from the page's start, a little before t0; it ends at the close.
          closedAtMs,
          video: recorded,
          copy: `test-results/web/promo/app-${LANG}.webm`,
        },
        null,
        2,
      )}\n`,
    );
    await video?.saveAs(join(OUT, `app-${LANG}.webm`));
    test.info().annotations.push({ type: 'email', description: email });
  }
});
