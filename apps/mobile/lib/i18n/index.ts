// i18next setup. Namespaces are loaded statically; missing-key handler
// falls back to the key itself in non-prod and logs a warning.
//
// Locales: de (default + fallback), en, fr, es, it.
// Legal namespace (onboarding §consent) is hand-translated; UX strings in
// fr/es/it were translated at slice H1; legal review still pending for
// each non-DE/EN locale before launch in those markets.

import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import deAuth from '../../locales/de/auth.json';
import deCapture from '../../locales/de/capture.json';
import deCommon from '../../locales/de/common.json';
import deOnboarding from '../../locales/de/onboarding.json';
import deUpload from '../../locales/de/upload.json';
import enAuth from '../../locales/en/auth.json';
import enCapture from '../../locales/en/capture.json';
import enCommon from '../../locales/en/common.json';
import enOnboarding from '../../locales/en/onboarding.json';
import enUpload from '../../locales/en/upload.json';
import esAuth from '../../locales/es/auth.json';
import esCapture from '../../locales/es/capture.json';
import esCommon from '../../locales/es/common.json';
import esOnboarding from '../../locales/es/onboarding.json';
import esUpload from '../../locales/es/upload.json';
import frAuth from '../../locales/fr/auth.json';
import frCapture from '../../locales/fr/capture.json';
import frCommon from '../../locales/fr/common.json';
import frOnboarding from '../../locales/fr/onboarding.json';
import frUpload from '../../locales/fr/upload.json';
import itAuth from '../../locales/it/auth.json';
import itCapture from '../../locales/it/capture.json';
import itCommon from '../../locales/it/common.json';
import itOnboarding from '../../locales/it/onboarding.json';
import itUpload from '../../locales/it/upload.json';

const resources = {
  de: {
    common: deCommon,
    onboarding: deOnboarding,
    auth: deAuth,
    capture: deCapture,
    upload: deUpload,
  },
  en: {
    common: enCommon,
    onboarding: enOnboarding,
    auth: enAuth,
    capture: enCapture,
    upload: enUpload,
  },
  fr: {
    common: frCommon,
    onboarding: frOnboarding,
    auth: frAuth,
    capture: frCapture,
    upload: frUpload,
  },
  es: {
    common: esCommon,
    onboarding: esOnboarding,
    auth: esAuth,
    capture: esCapture,
    upload: esUpload,
  },
  it: {
    common: itCommon,
    onboarding: itOnboarding,
    auth: itAuth,
    capture: itCapture,
    upload: itUpload,
  },
} as const;

export type AppLocale = keyof typeof resources;

const SUPPORTED: AppLocale[] = ['de', 'en', 'fr', 'es', 'it'];

function pickInitialLocale(): AppLocale {
  const code = Localization.getLocales()[0]?.languageCode ?? 'de';
  return (SUPPORTED as string[]).includes(code) ? (code as AppLocale) : 'de';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: pickInitialLocale(),
  fallbackLng: 'de',
  ns: ['common', 'onboarding', 'auth', 'capture', 'upload'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export { i18n };
