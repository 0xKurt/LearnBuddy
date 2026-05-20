// i18next setup. Namespaces are loaded statically; missing-key handler
// falls back to the key itself in non-prod and logs a warning.
//
// Locales: de (default + fallback), en, fr, es, it.
// Legal namespace (onboarding §consent) is hand-translated; UX strings in
// fr/es/it were translated at slice H1; legal review still pending for
// each non-DE/EN locale before launch in those markets.
//
// Initial-locale resolution:
//   1. SecureStore-saved locale (picker on first launch / admin settings)
//   2. Device locale if supported
//   3. 'de' as the last fallback
// Step 1 is async; init starts on the device locale and
// `hydrateSavedLocale()` patches `i18n.language` once SecureStore loads.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import {
  detectDeviceLocale,
  loadSavedLocale,
  saveLocale,
  type AppLocale,
} from './locale-storage.js';

import deAdmin from '../../locales/de/admin.json';
import deAuth from '../../locales/de/auth.json';
import deCapture from '../../locales/de/capture.json';
import deCoach from '../../locales/de/coach.json';
import deCommon from '../../locales/de/common.json';
import deErrors from '../../locales/de/errors.json';
import deHome from '../../locales/de/home.json';
import deOnboarding from '../../locales/de/onboarding.json';
import dePractice from '../../locales/de/practice.json';
import deResult from '../../locales/de/result.json';
import deExplain from '../../locales/de/explain.json';
import deUpload from '../../locales/de/upload.json';
import enAdmin from '../../locales/en/admin.json';
import enAuth from '../../locales/en/auth.json';
import enCapture from '../../locales/en/capture.json';
import enCoach from '../../locales/en/coach.json';
import enCommon from '../../locales/en/common.json';
import enErrors from '../../locales/en/errors.json';
import enHome from '../../locales/en/home.json';
import enOnboarding from '../../locales/en/onboarding.json';
import enPractice from '../../locales/en/practice.json';
import enResult from '../../locales/en/result.json';
import enExplain from '../../locales/en/explain.json';
import enUpload from '../../locales/en/upload.json';
import esAdmin from '../../locales/es/admin.json';
import esAuth from '../../locales/es/auth.json';
import esCapture from '../../locales/es/capture.json';
import esCoach from '../../locales/es/coach.json';
import esCommon from '../../locales/es/common.json';
import esErrors from '../../locales/es/errors.json';
import esHome from '../../locales/es/home.json';
import esOnboarding from '../../locales/es/onboarding.json';
import esPractice from '../../locales/es/practice.json';
import esResult from '../../locales/es/result.json';
import esExplain from '../../locales/es/explain.json';
import esUpload from '../../locales/es/upload.json';
import frAdmin from '../../locales/fr/admin.json';
import frAuth from '../../locales/fr/auth.json';
import frCapture from '../../locales/fr/capture.json';
import frCoach from '../../locales/fr/coach.json';
import frCommon from '../../locales/fr/common.json';
import frErrors from '../../locales/fr/errors.json';
import frHome from '../../locales/fr/home.json';
import frOnboarding from '../../locales/fr/onboarding.json';
import frPractice from '../../locales/fr/practice.json';
import frResult from '../../locales/fr/result.json';
import frExplain from '../../locales/fr/explain.json';
import frUpload from '../../locales/fr/upload.json';
import itAdmin from '../../locales/it/admin.json';
import itAuth from '../../locales/it/auth.json';
import itCapture from '../../locales/it/capture.json';
import itCoach from '../../locales/it/coach.json';
import itCommon from '../../locales/it/common.json';
import itErrors from '../../locales/it/errors.json';
import itHome from '../../locales/it/home.json';
import itOnboarding from '../../locales/it/onboarding.json';
import itPractice from '../../locales/it/practice.json';
import itResult from '../../locales/it/result.json';
import itExplain from '../../locales/it/explain.json';
import itUpload from '../../locales/it/upload.json';

const resources = {
  de: {
    common: deCommon,
    onboarding: deOnboarding,
    auth: deAuth,
    capture: deCapture,
    upload: deUpload,
    home: deHome,
    result: deResult,
    explain: deExplain,
    admin: deAdmin,
    errors: deErrors,
    coach: deCoach,
    practice: dePractice,
  },
  en: {
    common: enCommon,
    onboarding: enOnboarding,
    auth: enAuth,
    capture: enCapture,
    upload: enUpload,
    home: enHome,
    result: enResult,
    explain: enExplain,
    admin: enAdmin,
    errors: enErrors,
    coach: enCoach,
    practice: enPractice,
  },
  fr: {
    common: frCommon,
    onboarding: frOnboarding,
    auth: frAuth,
    capture: frCapture,
    upload: frUpload,
    home: frHome,
    result: frResult,
    explain: frExplain,
    admin: frAdmin,
    errors: frErrors,
    coach: frCoach,
    practice: frPractice,
  },
  es: {
    common: esCommon,
    onboarding: esOnboarding,
    auth: esAuth,
    capture: esCapture,
    upload: esUpload,
    home: esHome,
    result: esResult,
    explain: esExplain,
    admin: esAdmin,
    errors: esErrors,
    coach: esCoach,
    practice: esPractice,
  },
  it: {
    common: itCommon,
    onboarding: itOnboarding,
    auth: itAuth,
    capture: itCapture,
    upload: itUpload,
    home: itHome,
    result: itResult,
    explain: itExplain,
    admin: itAdmin,
    errors: itErrors,
    coach: itCoach,
    practice: itPractice,
  },
} as const;

export type { AppLocale };

void i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLocale(),
  fallbackLng: 'de',
  ns: [
    'common',
    'onboarding',
    'auth',
    'capture',
    'upload',
    'home',
    'result',
    'explain',
    'admin',
    'errors',
    'coach',
    'practice',
  ],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Pull any SecureStore-saved locale and apply it. Idempotent — safe to
 *  call from a useEffect in the root layout. */
export async function hydrateSavedLocale(): Promise<void> {
  const saved = await loadSavedLocale();
  if (saved && saved !== i18n.language) {
    await i18n.changeLanguage(saved);
  }
}

/** Set + persist the active locale. Used by the onboarding picker and the
 *  admin settings screen. Returns once both i18n and SecureStore are
 *  updated so the caller can navigate / re-render. */
export async function setLocale(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  await saveLocale(locale);
}

export { i18n };
