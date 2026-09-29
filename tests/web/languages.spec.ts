// The five languages are a promise: the same app, not the German one with other words
// (issue #76). Registration is where the text is longest — "Répète le mot de passe",
// "¿Cómo se llama tu hijo o tu hija?" — so that is where a screen breaks first.
//
// For each language: the welcome screen, the privacy step and the profile step, each
// measured on 390×844 and 360×740 (tests/web/fit.ts) and scanned by axe. What the
// German walkthrough proves for German, this proves for the rest — English included,
// so all five promised languages are measured.

import { expect, test } from '@playwright/test';

import { shot } from './fit';

type Lang = {
  code: string;
  /** The flag button on the welcome screen (its accessible name). */
  flag: string;
  title: string;
  create: string;
  email: string;
  password: string;
  repeat: string;
  consent: string;
  /** The "I have read this" checkbox label (start of it). */
  accept: RegExp;
  next: string;
  profile: string;
};

const LANGS: Lang[] = [
  {
    code: 'en',
    flag: 'English',
    title: 'Your study buddy for tests and exams.',
    create: 'Create account',
    email: 'E-mail',
    password: 'Password',
    repeat: 'Repeat password',
    consent: 'A quick word on privacy',
    accept: /I have read this and agree/,
    next: 'Continue',
    profile: 'Who is learning with LearnBuddy?',
  },
  {
    code: 'fr',
    flag: 'Français',
    title: 'Ton allié pour les contrôles et les interros.',
    create: 'Créer un compte',
    email: 'E-mail',
    password: 'Mot de passe',
    repeat: 'Répète le mot de passe',
    consent: 'Protection des données, en bref',
    accept: /J'ai lu ces informations/,
    next: 'Continuer',
    profile: 'Qui apprend avec LearnBuddy ?',
  },
  {
    code: 'es',
    flag: 'Español',
    title: 'Tu compañero de estudio para exámenes y controles.',
    create: 'Crear cuenta',
    email: 'Correo electrónico',
    password: 'Contraseña',
    repeat: 'Repite la contraseña',
    consent: 'Protección de datos en pocas palabras',
    accept: /Lo he leído/,
    next: 'Continuar',
    profile: '¿Quién aprende con LearnBuddy?',
  },
  {
    code: 'it',
    flag: 'Italiano',
    title: 'Il tuo compagno di studio per verifiche ed esami.',
    create: 'Crea account',
    email: 'Email',
    password: 'Password',
    repeat: 'Ripeti la password',
    consent: 'La privacy in breve',
    accept: /Ho letto queste informazioni/,
    next: 'Continua',
    profile: 'Chi impara con LearnBuddy?',
  },
];

for (const l of LANGS) {
  test(`registration fits in ${l.code}`, async ({ page }) => {
    await page.goto('/');
    // The flags are the first thing on the welcome screen: the app speaks her language
    // before she types anything.
    await page.getByRole('radio', { name: l.flag }).click();
    await expect(page.getByText(l.title)).toBeVisible();
    await shot(page, `60-welcome-${l.code}`);

    await page
      .getByLabel(l.email, { exact: true })
      .fill(`lang-${l.code}-${Date.now()}@example.test`);
    await page.getByLabel(l.password, { exact: true }).fill('geheim-1234');
    await page.getByLabel(l.repeat, { exact: true }).fill('geheim-1234');
    await page.getByRole('button', { name: l.create }).click();

    await expect(page.getByText(l.consent)).toBeVisible();
    await shot(page, `61-consent-${l.code}`);
    await page.getByRole('checkbox', { name: l.accept }).click();
    await page.getByRole('button', { name: l.next }).click();

    await expect(page.getByText(l.profile)).toBeVisible();
    await shot(page, `62-profile-${l.code}`);
  });
}
